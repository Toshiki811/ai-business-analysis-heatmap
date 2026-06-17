// SVGスイムレーンフロー描画。
// layoutFlow(座標計算・DOM非依存の純粋関数)と renderFlowSvg(SVG文字列生成)を分離し、
// レイアウト部は node --test からも検証する。
// 丸数字は numByTaskId を唯一のソースとし、マトリクスセル側と同一マップを共有する。
(function (global) {
  'use strict';

  var DEFAULTS = {
    laneWidth: 232,
    laneGap: 12,
    marginLeft: 64,   // 左外側は差戻しエッジの迂回チャネル
    marginRight: 24,
    marginTop: 8,
    marginBottom: 24,
    headerHeight: 38,
    rowGap: 36,
    fontSize: 12,
    lineHeight: 16,
    chipHeight: 20
  };

  // ------------------------------------------------------------------
  // テキスト計測(等幅近似: 全角≒fontSize、半角≒0.55×fontSize)
  // ------------------------------------------------------------------
  function charWidth(ch, fontSize) {
    // 半角(ASCII・半角カナ)は0.55倍、それ以外(全角)は等幅とみなす近似
    return /[ -ʯ｡-ﾟ]/.test(ch) ? fontSize * 0.55 : fontSize;
  }

  function textWidth(text, fontSize) {
    var width = 0;
    var str = String(text || '');
    for (var i = 0; i < str.length; i += 1) width += charWidth(str[i], fontSize);
    return width;
  }

  function wrapText(text, maxWidth, fontSize) {
    var str = String(text || '').replace(/\s+/g, ' ').trim();
    if (!str) return [];
    var lines = [];
    var line = '';
    var lineW = 0;
    for (var i = 0; i < str.length; i += 1) {
      var w = charWidth(str[i], fontSize);
      if (lineW + w > maxWidth && line) {
        lines.push(line);
        line = '';
        lineW = 0;
      }
      line += str[i];
      lineW += w;
    }
    if (line) lines.push(line);
    return lines;
  }

  function truncate(text, maxWidth, fontSize) {
    var str = String(text || '').replace(/\s+/g, ' ').trim();
    if (textWidth(str, fontSize) <= maxWidth) return str;
    var out = '';
    var width = 0;
    var limit = maxWidth - fontSize; // 「…」分
    for (var i = 0; i < str.length; i += 1) {
      var w = charWidth(str[i], fontSize);
      if (width + w > limit) break;
      out += str[i];
      width += w;
    }
    return out + '…';
  }

  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚';
  function circledNumber(n) {
    return n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : String(n);
  }

  function nodeKind(node) {
    var kind = String(node.node_type || 'process');
    return ['start', 'end', 'process', 'decision', 'exception'].indexOf(kind) >= 0 ? kind : 'process';
  }

  // ------------------------------------------------------------------
  // レイアウト計算
  // ------------------------------------------------------------------
  function layoutFlow(flow, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var nodes = Array.isArray(flow && flow.nodes) ? flow.nodes : [];
    var questionNodeIds = o.questionNodeIds || [];
    var answeredNodeIds = o.answeredNodeIds || [];

    // レーン割当: actors宣言順 + 未宣言actorの出現順追補
    var actors = [];
    (Array.isArray(flow && flow.actors) ? flow.actors : []).forEach(function (actor) {
      var name = String(actor || '').trim();
      if (name && actors.indexOf(name) < 0) actors.push(name);
    });
    nodes.forEach(function (node) {
      var name = String(node.actor || '').trim();
      if (name && actors.indexOf(name) < 0) actors.push(name);
    });
    if (actors.length === 0) actors.push('担当者');

    var lanes = actors.map(function (actor, index) {
      return {
        actor: actor,
        index: index,
        x: o.marginLeft + index * (o.laneWidth + o.laneGap),
        width: o.laneWidth
      };
    });
    var laneByActor = {};
    lanes.forEach(function (lane) { laneByActor[lane.actor] = lane; });

    var width = o.marginLeft + lanes.length * (o.laneWidth + o.laneGap) - o.laneGap + o.marginRight;

    // ノード行配置(1ノード=1行、行高は折返し+IOチップで可変)
    var laidNodes = [];
    var indexById = {};
    var numByTaskId = {};
    var cursor = o.marginTop + o.headerHeight + o.rowGap;
    var displayNum = 0;

    nodes.forEach(function (node, index) {
      var kind = nodeKind(node);
      var lane = laneByActor[String(node.actor || '').trim()] || lanes[0];
      var inferred = node.confidence === 'inferred';
      var nodeId = String(node.id || ('n' + (index + 1)));
      indexById[nodeId] = index;

      var num = null;
      if (kind !== 'start' && kind !== 'end') {
        displayNum += 1;
        num = displayNum;
        if (node.task_id && numByTaskId[node.task_id] === undefined) {
          numByTaskId[node.task_id] = num;
        }
      }

      var w; var h; var labelLines;
      var label = String(node.label || '');
      if (kind === 'decision') {
        w = o.laneWidth - 36;
        labelLines = wrapText(node.condition || label, w - 56, o.fontSize);
        h = Math.max(76, labelLines.length * o.lineHeight + 44);
      } else if (kind === 'start' || kind === 'end') {
        labelLines = [truncate(label || (kind === 'start' ? '開始' : '終了'), o.laneWidth - 60, o.fontSize)];
        w = Math.max(96, Math.min(o.laneWidth - 48, textWidth(labelLines[0], o.fontSize) + 32));
        h = 30;
      } else {
        w = o.laneWidth - 44;
        labelLines = wrapText(label, w - 20, o.fontSize);
        if (labelLines.length === 0) labelLines = ['作業 ' + (index + 1)];
        h = Math.max(40, labelLines.length * o.lineHeight + 18);
      }

      var inputs = (Array.isArray(node.inputs) ? node.inputs : []).filter(Boolean);
      var outputs = (Array.isArray(node.outputs) ? node.outputs : []).filter(Boolean);
      var inPad = inputs.length > 0 ? o.chipHeight + 6 : 0;
      var outPad = outputs.length > 0 ? o.chipHeight + 6 : 0;

      var y = cursor + inPad;
      laidNodes.push({
        node: node,
        id: nodeId,
        index: index,
        kind: kind,
        lane: lane,
        x: lane.x + Math.round((lane.width - w) / 2),
        y: y,
        w: w,
        h: h,
        num: num,
        labelLines: labelLines,
        inferred: inferred,
        inputs: inputs,
        outputs: outputs,
        hasQuestion: questionNodeIds.indexOf(nodeId) >= 0,
        answered: answeredNodeIds.indexOf(nodeId) >= 0,
        rowTop: cursor,
        rowBottom: y + h + outPad
      });
      cursor = y + h + outPad + o.rowGap;
    });

    var height = cursor - o.rowGap + o.marginBottom + o.rowGap * 0.5;

    // エッジ構築
    var edges = [];
    var gapUse = {};   // 行間ギャップごとの水平セグメント使用数(重なり回避オフセット)
    var returnUse = { count: 0 };

    function gapOffset(gapIndex) {
      var key = 'g' + gapIndex;
      gapUse[key] = (gapUse[key] || 0) + 1;
      return (gapUse[key] - 1) * 7;
    }

    function centerX(laid) { return laid.x + laid.w / 2; }

    function routeForward(source, target, edge) {
      var sx = centerX(source);
      var tx = centerX(target);
      var sy = source.y + source.h + (source.outputs.length ? o.chipHeight + 6 : 0);
      var sy0 = source.y + source.h;
      var ty = target.y - (target.inputs.length ? o.chipHeight + 6 : 0);
      var ty0 = target.y;
      // IOチップを跨ぐ場合は行下端/上端から出入りする
      var exitY = source.outputs.length ? sy : sy0;
      var entryY = target.inputs.length ? ty : ty0;
      var gapY = source.rowBottom + o.rowGap / 2 + gapOffset(source.index);

      if (target.index === source.index + 1) {
        if (source.lane.index === target.lane.index && Math.abs(sx - tx) < 1) {
          edge.points = [[sx, exitY], [sx, entryY]];
        } else {
          edge.points = [[sx, exitY], [sx, gapY], [tx, gapY], [tx, entryY]];
        }
        return;
      }
      // 行をまたぐ前方エッジ: 対象レーンの右側チャネルを経由して中間ノードを回避
      var channelX = target.lane.x + target.lane.width - 8;
      var gapAboveT = target.rowTop - o.rowGap / 2 - gapOffset(target.index - 1);
      edge.points = [
        [sx, exitY],
        [sx, gapY],
        [channelX, gapY],
        [channelX, gapAboveT],
        [tx, gapAboveT],
        [tx, entryY]
      ];
    }

    function routeReturn(source, target, edge) {
      // 差戻し: 左外側チャネルを迂回(複数あればチャネルを8pxずつ外へ)
      returnUse.count += 1;
      var channelX = o.marginLeft - 18 - (returnUse.count - 1) * 10;
      if (channelX < 6) channelX = 6;
      var sy = source.y + source.h / 2;
      var ty = target.y + target.h / 2;
      edge.points = [
        [source.x, sy],
        [channelX, sy],
        [channelX, ty],
        [target.x, ty]
      ];
    }

    laidNodes.forEach(function (source) {
      var node = source.node;
      var branches = Array.isArray(node.branches) ? node.branches : [];
      branches.forEach(function (branch) {
        var targetIndex = indexById[String(branch.target || '')];
        if (targetIndex === undefined) return;
        var target = laidNodes[targetIndex];
        var backward = targetIndex <= source.index;
        var type = branch.edge_type || (backward ? 'return' : (target.kind === 'exception' ? 'exception' : 'normal'));
        var edge = { from: source.id, to: target.id, type: type, label: String(branch.label || '') };
        if (type === 'return' || backward) {
          edge.type = 'return';
          routeReturn(source, target, edge);
        } else {
          routeForward(source, target, edge);
        }
        edges.push(edge);
      });
      if (branches.length > 0 && !node.next) return;
      if (source.kind === 'end') return;
      var nextIndex = node.next !== undefined && node.next !== null && String(node.next) !== ''
        ? indexById[String(node.next)]
        : (source.index + 1 < laidNodes.length ? source.index + 1 : undefined);
      if (nextIndex === undefined) return;
      var target = laidNodes[nextIndex];
      var edge = { from: source.id, to: target.id, type: 'normal', label: '' };
      if (nextIndex <= source.index) {
        edge.type = 'return';
        routeReturn(source, target, edge);
      } else {
        routeForward(source, target, edge);
      }
      edges.push(edge);
    });

    return {
      flow: flow,
      opts: o,
      lanes: lanes,
      nodes: laidNodes,
      edges: edges,
      width: Math.round(width),
      height: Math.round(height),
      numByTaskId: numByTaskId
    };
  }

  // ------------------------------------------------------------------
  // SVG文字列生成
  // ------------------------------------------------------------------
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pathFromPoints(points) {
    return points.map(function (point, index) {
      return (index === 0 ? 'M' : 'L') + point[0] + ' ' + point[1];
    }).join(' ');
  }

  function edgeLabelPos(edge) {
    var points = edge.points;
    // 最初の水平セグメントの中点(無ければ最初のセグメントの中点)
    for (var i = 0; i < points.length - 1; i += 1) {
      if (Math.abs(points[i][1] - points[i + 1][1]) < 1 && Math.abs(points[i][0] - points[i + 1][0]) > 30) {
        return [(points[i][0] + points[i + 1][0]) / 2, points[i][1] - 5];
      }
    }
    var a = points[0];
    var b = points[points.length - 1];
    return [(a[0] + b[0]) / 2 + 6, (a[1] + b[1]) / 2 - 5];
  }

  function renderChip(laid, items, isInput, o) {
    var lane = laid.lane;
    var text = truncate((isInput ? 'IN ' : 'OUT ') + items.join('、'), lane.width - 36, 10);
    var width = Math.min(lane.width - 16, textWidth(text, 10) + 22);
    var x = isInput ? lane.x + 8 : lane.x + lane.width - 8 - width;
    var y = isInput ? laid.y - o.chipHeight - 6 : laid.y + laid.h + 6;
    var cls = isInput ? 'flow-chip flow-chip-in' : 'flow-chip flow-chip-out';
    return '<g class="' + cls + '">' +
      '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + o.chipHeight + '" rx="4"/>' +
      '<path d="M' + (x + 7) + ' ' + (y + 5) + ' h6 l3 3 v7 h-9 z" class="flow-chip-doc"/>' +
      '<text x="' + (x + 19) + '" y="' + (y + o.chipHeight / 2 + 3.5) + '">' + esc(text.replace(/^(IN|OUT) /, '')) + '</text>' +
      '</g>';
  }

  function renderNode(laid, o) {
    var parts = [];
    var cls = ['flow-node', 'flow-node-' + laid.kind];
    if (laid.inferred) cls.push('is-inferred');
    if (laid.hasQuestion) cls.push('has-question');
    if (laid.answered) cls.push('is-answered');
    var attrs = ' data-node-id="' + esc(laid.id) + '"';
    if (laid.node.task_id) attrs += ' data-task-id="' + esc(laid.node.task_id) + '"';
    parts.push('<g class="' + cls.join(' ') + '"' + attrs + '>');

    var cx = laid.x + laid.w / 2;
    var cy = laid.y + laid.h / 2;

    if (laid.kind === 'decision') {
      var px = [
        [cx, laid.y],
        [laid.x + laid.w, cy],
        [cx, laid.y + laid.h],
        [laid.x, cy]
      ].map(function (p) { return p.join(','); }).join(' ');
      parts.push('<polygon class="flow-shape" points="' + px + '"/>');
    } else if (laid.kind === 'start' || laid.kind === 'end') {
      parts.push('<rect class="flow-shape" x="' + laid.x + '" y="' + laid.y + '" width="' + laid.w + '" height="' + laid.h + '" rx="' + (laid.h / 2) + '"/>');
    } else {
      parts.push('<rect class="flow-shape" x="' + laid.x + '" y="' + laid.y + '" width="' + laid.w + '" height="' + laid.h + '" rx="7"/>');
    }

    // ラベル(縦中央揃え)
    var lineH = o.lineHeight;
    var totalH = laid.labelLines.length * lineH;
    var startY = cy - totalH / 2 + lineH * 0.72;
    laid.labelLines.forEach(function (line, index) {
      parts.push('<text class="flow-label" x="' + cx + '" y="' + (startY + index * lineH) + '" text-anchor="middle">' + esc(line) + '</text>');
    });

    // 丸数字チップ(マトリクスセルと同一ソース)
    if (laid.num !== null) {
      var nx = laid.kind === 'decision' ? cx : laid.x;
      var ny = laid.y;
      parts.push('<g class="flow-num"><circle cx="' + nx + '" cy="' + ny + '" r="10"/>' +
        '<text x="' + nx + '" y="' + (ny + 3.5) + '" text-anchor="middle">' + laid.num + '</text></g>');
    }

    // 推定バッジ / 確認バッジ
    if (laid.inferred) {
      var bx = laid.x + laid.w;
      parts.push('<g class="flow-badge flow-badge-inferred"><rect x="' + (bx - 34) + '" y="' + (laid.y - 9) + '" width="38" height="16" rx="8"/>' +
        '<text x="' + (bx - 15) + '" y="' + (laid.y + 3) + '" text-anchor="middle">推定</text></g>');
    }
    if (laid.hasQuestion || laid.answered) {
      var qx = laid.kind === 'decision' ? laid.x + laid.w - 6 : laid.x + laid.w;
      var qcls = laid.answered && !laid.hasQuestion ? 'flow-badge flow-badge-answered' : 'flow-badge flow-badge-question';
      var glyph = laid.answered && !laid.hasQuestion ? '✓' : '?';
      parts.push('<g class="' + qcls + '"><circle cx="' + qx + '" cy="' + (laid.y + laid.h) + '" r="9"/>' +
        '<text x="' + qx + '" y="' + (laid.y + laid.h + 3.5) + '" text-anchor="middle">' + glyph + '</text></g>');
    }

    if (laid.inputs.length > 0) parts.push(renderChip(laid, laid.inputs, true, o));
    if (laid.outputs.length > 0) parts.push(renderChip(laid, laid.outputs, false, o));

    parts.push('</g>');
    return parts.join('');
  }

  function renderFlowSvg(layout, opts) {
    var o = layout.opts;
    var renderOpts = opts || {};
    var parts = [];
    var idSuffix = Math.random().toString(36).slice(2, 8);

    parts.push('<svg xmlns="http://www.w3.org/2000/svg" class="flow-svg" viewBox="0 0 ' + layout.width + ' ' + layout.height + '"' +
      (renderOpts.fitWidth === false ? '' : ' width="100%"') + ' role="img">');

    parts.push('<defs>' +
      ['normal', 'return', 'exception'].map(function (type) {
        return '<marker id="arr-' + type + '-' + idSuffix + '" class="flow-arrow-' + type + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
          '<path d="M0 0 L10 5 L0 10 z"/></marker>';
      }).join('') +
      '</defs>');

    // レーン背景+ヘッダ
    layout.lanes.forEach(function (lane, index) {
      var tint = index % 2 === 0 ? ' flow-lane-even' : ' flow-lane-odd';
      parts.push('<g class="flow-lane' + tint + '">' +
        '<rect class="flow-lane-bg" x="' + lane.x + '" y="' + o.marginTop + '" width="' + lane.width + '" height="' + (layout.height - o.marginTop - 8) + '" rx="8"/>' +
        '<rect class="flow-lane-header" x="' + lane.x + '" y="' + o.marginTop + '" width="' + lane.width + '" height="' + o.headerHeight + '" rx="8"/>' +
        '<text class="flow-lane-title" x="' + (lane.x + lane.width / 2) + '" y="' + (o.marginTop + o.headerHeight / 2 + 4.5) + '" text-anchor="middle">' + esc(truncate(lane.actor, lane.width - 24, 12)) + '</text>' +
        '</g>');
    });

    // エッジ(ノードの下層)
    layout.edges.forEach(function (edge) {
      parts.push('<g class="flow-edge flow-edge-' + edge.type + '">' +
        '<path d="' + pathFromPoints(edge.points) + '" fill="none" marker-end="url(#arr-' + edge.type + '-' + idSuffix + ')"/>');
      if (edge.label) {
        var pos = edgeLabelPos(edge);
        parts.push('<text class="flow-edge-label" x="' + pos[0] + '" y="' + pos[1] + '" text-anchor="middle">' + esc(edge.label) + '</text>');
      }
      parts.push('</g>');
    });

    layout.nodes.forEach(function (laid) {
      parts.push(renderNode(laid, o));
    });

    parts.push('</svg>');
    return parts.join('');
  }

  // ------------------------------------------------------------------
  // ズーム/パン(viewBox操作、ブラウザ専用)
  // ------------------------------------------------------------------
  function enablePanZoom(container) {
    var svg = container.querySelector('svg.flow-svg');
    if (!svg) return;
    var vb = svg.getAttribute('viewBox').split(' ').map(Number);
    var base = vb.slice();
    var scale = 1;

    function apply() {
      svg.setAttribute('viewBox', vb.join(' '));
    }
    function zoom(factor, cx, cy) {
      var newScale = Math.min(4, Math.max(0.4, scale * factor));
      factor = newScale / scale;
      scale = newScale;
      vb[2] = vb[2] / factor;
      vb[3] = vb[3] / factor;
      vb[0] = cx - (cx - vb[0]) / factor;
      vb[1] = cy - (cy - vb[1]) / factor;
      apply();
    }

    var toolbar = document.createElement('div');
    toolbar.className = 'flow-toolbar';
    [['＋', function () { zoom(1.25, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2); }],
     ['－', function () { zoom(0.8, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2); }],
     ['⤢', function () { vb = base.slice(); scale = 1; apply(); }]
    ].forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item[0];
      btn.addEventListener('click', item[1]);
      toolbar.appendChild(btn);
    });
    container.appendChild(toolbar);

    var dragging = null;
    svg.addEventListener('pointerdown', function (event) {
      if (event.target.closest('.flow-node')) return;
      dragging = { x: event.clientX, y: event.clientY, vb: vb.slice() };
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('is-panning');
    });
    svg.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var rect = svg.getBoundingClientRect();
      var dx = (event.clientX - dragging.x) * (vb[2] / rect.width);
      var dy = (event.clientY - dragging.y) * (vb[3] / rect.height);
      vb[0] = dragging.vb[0] - dx;
      vb[1] = dragging.vb[1] - dy;
      apply();
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      svg.addEventListener(type, function () {
        dragging = null;
        svg.classList.remove('is-panning');
      });
    });
  }

  global.FlowSvg = {
    layoutFlow: layoutFlow,
    renderFlowSvg: renderFlowSvg,
    enablePanZoom: enablePanZoom,
    wrapText: wrapText,
    textWidth: textWidth,
    circledNumber: circledNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);
