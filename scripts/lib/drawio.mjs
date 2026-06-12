import { escXml } from './escape.mjs';

const LANES = [
  { actor: 'Human', x: 80, color: '#dae8fc', stroke: '#6c8ebf', label: 'Human' },
  { actor: 'AI', x: 370, color: '#e1d5e7', stroke: '#9673a6', label: 'AI' },
  { actor: 'Human Review', x: 660, color: '#fff2cc', stroke: '#d6b656', label: 'Human Review' },
  { actor: 'System', x: 950, color: '#f5f5f5', stroke: '#666666', label: 'System' }
];

const AS_IS_LANES = [
  { actor: '担当者・業務部門', x: 80, color: '#dae8fc', stroke: '#6c8ebf', label: '担当者・業務部門' },
  { actor: '上長・管理者・承認者', x: 390, color: '#e1d5e7', stroke: '#9673a6', label: '上長・管理者・承認者' },
  { actor: 'システム', x: 700, color: '#f5f5f5', stroke: '#666666', label: 'システム' }
];

function compactLine(value, maxLength = 42) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function stepBaseId(step, index) {
  return step.id || step.node_id || `process-${index + 1}`;
}

function isDecision(step) {
  return step.node_type === 'decision' || Boolean(step.condition && Array.isArray(step.branches));
}

function resolveTarget(target, idByStepId) {
  if (!target) return '';
  const raw = String(target);
  return idByStepId.get(raw) || raw;
}

function edgeCell(id, source, target, label = '', styleOverride = '') {
  const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;fontSize=11;fontColor=#1f2937;${styleOverride}`;
  return `<mxCell id="${escXml(id)}" value="${escXml(label)}" style="${style}" edge="1" parent="1" source="${escXml(source)}" target="${escXml(target)}"><mxGeometry relative="1" as="geometry" /></mxCell>`;
}

function renderFlowToDrawio({
  flow,
  title,
  now,
  lanes,
  lanePrefix,
  pageWidth,
  titleWidth,
  startY,
  rowGap,
  actorLaneForStep,
  valueForStep,
  processSize,
  decisionSize
}) {
  const rows = Array.isArray(flow) ? flow : [];
  const height = Math.max(520, 180 + rows.length * rowGap);
  const idByStepId = new Map();
  rows.forEach((step, index) => {
    const cellId = stepBaseId(step, index);
    idByStepId.set(String(cellId), cellId);
    if (step.id) idByStepId.set(String(step.id), cellId);
    if (step.node_id) idByStepId.set(String(step.node_id), cellId);
  });

  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    `<mxCell id="title" value="${escXml(title)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;fontSize=18;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="80" y="30" width="${titleWidth}" height="30" as="geometry" /></mxCell>`
  ];

  lanes.forEach((lane, index) => {
    cells.push(`<mxCell id="${lanePrefix}-${index}" value="${escXml(lane.label)}" style="swimlane;horizontal=1;startSize=32;html=1;fillColor=${lane.color};strokeColor=${lane.stroke};fontSize=12;fontStyle=1;opacity=80;" vertex="1" parent="1"><mxGeometry x="${lane.x}" y="80" width="${lane.width}" height="${height}" as="geometry" /></mxCell>`);
  });

  rows.forEach((step, index) => {
    const lane = actorLaneForStep(step);
    const y = startY + index * rowGap;
    const cellId = stepBaseId(step, index);
    const decision = isDecision(step);
    const size = decision ? decisionSize : processSize;
    const x = lane.x + Math.round((lane.width - size.width) / 2);
    const value = valueForStep(step, index, decision);
    const shapeStyle = decision
      ? 'rhombus;whiteSpace=wrap;html=1;'
      : 'rounded=1;whiteSpace=wrap;html=1;';
    const fillColor = decision ? '#fff2cc' : (step.fillColor || lane.color);
    const strokeColor = decision ? '#d6b656' : (step.strokeColor || lane.stroke);
    const strokeWidth = step.strokeWidth || 1;
    cells.push(`<mxCell id="${escXml(cellId)}" value="${escXml(value)}" style="${shapeStyle}fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=${strokeWidth};fontSize=11;fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${size.width}" height="${size.height}" as="geometry" /></mxCell>`);
  });

  rows.forEach((step, index) => {
    const sourceId = stepBaseId(step, index);
    const branches = Array.isArray(step.branches) ? step.branches : [];
    if (branches.length > 0) {
      branches.forEach((branch, branchIndex) => {
        const targetId = resolveTarget(branch.target, idByStepId);
        if (!targetId) return;
        cells.push(edgeCell(`edge-${index + 1}-${branchIndex + 1}`, sourceId, targetId, branch.label || ''));
      });
      if (!step.next) return;
    }
    const nextTarget = step.next
      ? resolveTarget(step.next, idByStepId)
      : (rows[index + 1] ? stepBaseId(rows[index + 1], index + 1) : '');
    if (nextTarget) cells.push(edgeCell(`edge-${index + 1}`, sourceId, nextTarget));
  });

  return `<mxfile host="app.diagrams.net" modified="${now.toISOString()}" agent="5.0" version="24.0.0">
  <diagram name="${escXml(title)}" id="${escXml(title).replace(/[^A-Za-z0-9_-]/g, '-')}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${height + 180}" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

export function flowToDrawio(flow, title, now = new Date()) {
  const lanes = LANES.map((lane) => ({ ...lane, width: 250 }));
  return renderFlowToDrawio({
    flow,
    title,
    now,
    lanes,
    lanePrefix: 'lane',
    pageWidth: 1300,
    titleWidth: 760,
    startY: 130,
    rowGap: 130,
    actorLaneForStep: (step) => lanes.find((lane) => lane.actor === step.actor) || lanes[0],
    valueForStep: (step, index, decision) => {
      if (decision) {
        return [
          step.step || `Decision ${index + 1}`,
          step.condition || step.description || ''
        ].filter(Boolean).join('\n');
      }
      return `${step.step || `Step ${index + 1}`}\n${step.actor || 'Human'}\n${step.description || ''}`;
    },
    processSize: { width: 180, height: 80 },
    decisionSize: { width: 170, height: 100 }
  });
}

const DETAIL_LANE_PALETTE = [
  { color: '#dae8fc', stroke: '#6c8ebf' },
  { color: '#e1d5e7', stroke: '#9673a6' },
  { color: '#d5e8d4', stroke: '#82b366' },
  { color: '#fff2cc', stroke: '#d6b656' },
  { color: '#ffe6cc', stroke: '#d79b00' },
  { color: '#f5f5f5', stroke: '#666666' },
  { color: '#f8cecc', stroke: '#b85450' },
  { color: '#e0f2fe', stroke: '#0284c7' }
];

const DETAIL_EDGE_STYLES = {
  normal: '',
  return: 'strokeColor=#dc2626;dashed=1;dashPattern=6 4;exitX=0;exitY=0.5;entryX=0;entryY=0.5;',
  exception: 'strokeColor=#d79b00;dashed=1;dashPattern=6 4;',
  document: 'strokeColor=#94a3b8;strokeWidth=1;dashed=1;dashPattern=3 3;endArrow=open;endFill=0;'
};

function detailNodeKind(node) {
  const kind = String(node.node_type || 'process');
  return ['start', 'end', 'process', 'decision', 'exception'].includes(kind) ? kind : 'process';
}

function detailNodeSize(kind) {
  if (kind === 'decision') return { width: 190, height: 104 };
  if (kind === 'start' || kind === 'end') return { width: 130, height: 52 };
  return { width: 200, height: 86 };
}

function detailNodeStyle(node, kind, lane) {
  const inferred = node.confidence === 'inferred';
  const dashed = inferred ? 'dashed=1;dashPattern=4 4;' : '';
  if (kind === 'decision') {
    return `rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;${dashed}fontSize=11;fontColor=#000000;`;
  }
  if (kind === 'start' || kind === 'end') {
    return `rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;${dashed}fontSize=11;fontStyle=1;fontColor=#000000;`;
  }
  if (kind === 'exception') {
    return `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;strokeWidth=2;${dashed}fontSize=11;fontColor=#000000;`;
  }
  return `rounded=1;whiteSpace=wrap;html=1;fillColor=${lane.color};strokeColor=${lane.stroke};${dashed}fontSize=11;fontColor=#000000;`;
}

function detailNodeValue(node, kind, index) {
  const inferredSuffix = node.confidence === 'inferred' ? '【要確認(推定)】' : '';
  if (kind === 'decision') {
    return [
      node.condition || node.label || `判断 ${index + 1}`,
      node.label && node.condition && node.label !== node.condition ? compactLine(node.label, 36) : '',
      inferredSuffix
    ].filter(Boolean).join('\n');
  }
  if (kind === 'start' || kind === 'end') {
    return [node.label || (kind === 'start' ? '開始' : '終了'), inferredSuffix].filter(Boolean).join('\n');
  }
  const metaLine = [node.minutes ? `${node.minutes}分` : '', node.burden ? `負担: ${node.burden}` : '']
    .filter(Boolean).join(' / ');
  return [
    `${index + 1}. ${node.label || `作業 ${index + 1}`}`,
    node.actor ? compactLine(node.actor, 24) : '',
    compactLine(node.description, 56),
    metaLine,
    node.question ? `【要確認】${compactLine(node.question, 40)}` : '',
    inferredSuffix
  ].filter(Boolean).join('\n');
}

function detailLegendCells(x, y) {
  const items = [
    { shape: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;', label: '作業(担当レーン色)' },
    { shape: 'rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;', label: '判断・分岐' },
    { shape: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;strokeWidth=2;', label: '例外処理' },
    { shape: 'shape=document;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#94a3b8;', label: '入出力帳票・資料' },
    { shape: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#64748b;dashed=1;dashPattern=4 4;', label: '推定(要確認)' },
    { shape: 'line;html=1;strokeWidth=2;strokeColor=#666666;', label: '通常の流れ・分岐' },
    { shape: 'line;html=1;strokeWidth=2;strokeColor=#dc2626;dashed=1;dashPattern=6 4;', label: '差戻し・戻り' },
    { shape: 'line;html=1;strokeWidth=2;strokeColor=#d79b00;dashed=1;dashPattern=6 4;', label: '例外への遷移' },
    { shape: 'line;html=1;strokeWidth=1;strokeColor=#94a3b8;dashed=1;dashPattern=3 3;', label: '帳票の受け渡し' }
  ];
  const rowHeight = 30;
  const cells = [
    `<mxCell id="legend-box" value="凡例" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#cbd5e1;verticalAlign=top;fontSize=12;fontStyle=1;align=left;spacingLeft=10;spacingTop=6;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="220" height="${items.length * rowHeight + 44}" as="geometry" /></mxCell>`
  ];
  items.forEach((item, index) => {
    const itemY = y + 36 + index * rowHeight;
    const isLine = item.shape.startsWith('line;');
    const shapeHeight = isLine ? 8 : 20;
    const shapeY = isLine ? itemY + 7 : itemY;
    cells.push(`<mxCell id="legend-shape-${index}" value="" style="${item.shape}fontSize=9;" vertex="1" parent="1"><mxGeometry x="${x + 10}" y="${shapeY}" width="34" height="${shapeHeight}" as="geometry" /></mxCell>`);
    cells.push(`<mxCell id="legend-label-${index}" value="${escXml(item.label)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=11;fontColor=#334155;" vertex="1" parent="1"><mxGeometry x="${x + 52}" y="${itemY - 4}" width="${220 - 60}" height="26" as="geometry" /></mxCell>`);
  });
  return cells;
}

export function detailAsIsFlowToDrawio(flow, title, categoryUpdateNote = '', now = new Date()) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const declaredActors = (Array.isArray(flow?.actors) ? flow.actors : [])
    .map((actor) => String(actor || '').trim()).filter(Boolean);
  const actors = [...declaredActors];
  for (const node of nodes) {
    const actor = String(node.actor || '').trim();
    if (actor && !actors.includes(actor)) actors.push(actor);
  }
  if (actors.length === 0) actors.push('担当者');

  const laneStartX = 80;
  const laneWidth = 240;
  const laneGap = 10;
  const lanes = new Map(actors.map((actor, index) => {
    const palette = DETAIL_LANE_PALETTE[index % DETAIL_LANE_PALETTE.length];
    return [actor, {
      actor,
      x: laneStartX + index * (laneWidth + laneGap),
      width: laneWidth,
      ...palette
    }];
  }));
  const defaultLane = lanes.get(actors[0]);
  const lanesEndX = laneStartX + actors.length * (laneWidth + laneGap) - laneGap;

  const categoryNote = String(categoryUpdateNote || '').replace(/\s+/g, ' ').trim();
  const startY = categoryNote ? 220 : 150;

  // 行レイアウト: 各ノードの上下に帳票シェイプ分の余白を確保する
  const layouts = [];
  let y = startY;
  nodes.forEach((node) => {
    const kind = detailNodeKind(node);
    const size = detailNodeSize(kind);
    const hasInputs = Array.isArray(node.inputs) && node.inputs.length > 0;
    const hasOutputs = Array.isArray(node.outputs) && node.outputs.length > 0;
    const topPad = hasInputs ? 58 : 0;
    const bottomPad = hasOutputs ? 62 : 0;
    const nodeY = y + topPad;
    layouts.push({ node, kind, size, nodeY, hasInputs, hasOutputs });
    y = nodeY + size.height + bottomPad + 56;
  });
  const height = Math.max(560, y - startY + 200);

  const idByNodeId = new Map();
  layouts.forEach(({ node }, index) => {
    const cellId = String(node.id || `detail-${index + 1}`);
    idByNodeId.set(cellId, cellId);
    if (node.id) idByNodeId.set(String(node.id), cellId);
  });
  const indexById = new Map(layouts.map(({ node }, index) => [String(node.id || `detail-${index + 1}`), index]));

  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    `<mxCell id="title" value="${escXml(title)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;fontSize=18;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="80" y="30" width="${Math.max(760, lanesEndX - 80)}" height="30" as="geometry" /></mxCell>`
  ];

  if (categoryNote) {
    cells.push(`<mxCell id="category-update-note" value="${escXml(`業務分類更新メモ\n${compactLine(categoryNote, 120)}`)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0284c7;fontSize=12;fontColor=#0f172a;align=left;verticalAlign=top;spacing=8;" vertex="1" parent="1"><mxGeometry x="80" y="76" width="${Math.max(760, lanesEndX - 100)}" height="58" as="geometry" /></mxCell>`);
  }

  [...lanes.values()].forEach((lane, index) => {
    cells.push(`<mxCell id="detail-lane-${index}" value="${escXml(lane.actor)}" style="swimlane;horizontal=1;startSize=32;html=1;fillColor=${lane.color};strokeColor=${lane.stroke};fontSize=12;fontStyle=1;opacity=80;" vertex="1" parent="1"><mxGeometry x="${lane.x}" y="${startY - 50}" width="${lane.width}" height="${height}" as="geometry" /></mxCell>`);
  });

  cells.push(...detailLegendCells(lanesEndX + 24, startY - 50));

  layouts.forEach(({ node, kind, size, nodeY, hasInputs, hasOutputs }, index) => {
    const lane = lanes.get(String(node.actor || '').trim()) || defaultLane;
    const cellId = String(node.id || `detail-${index + 1}`);
    const x = lane.x + Math.round((lane.width - size.width) / 2);
    cells.push(`<mxCell id="${escXml(cellId)}" value="${escXml(detailNodeValue(node, kind, index))}" style="${detailNodeStyle(node, kind, lane)}" vertex="1" parent="1"><mxGeometry x="${x}" y="${nodeY}" width="${size.width}" height="${size.height}" as="geometry" /></mxCell>`);

    if (hasInputs) {
      const docId = `${cellId}-doc-in`;
      const docValue = node.inputs.map((doc) => String(doc || '').trim()).filter(Boolean).join('\n');
      cells.push(`<mxCell id="${escXml(docId)}" value="${escXml(compactLine(docValue, 60))}" style="shape=document;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#94a3b8;fontSize=10;fontColor=#334155;" vertex="1" parent="1"><mxGeometry x="${lane.x + 8}" y="${nodeY - 54}" width="140" height="44" as="geometry" /></mxCell>`);
      cells.push(edgeCell(`${cellId}-doc-in-edge`, docId, cellId, '', DETAIL_EDGE_STYLES.document));
    }
    if (hasOutputs) {
      const docId = `${cellId}-doc-out`;
      const docValue = node.outputs.map((doc) => String(doc || '').trim()).filter(Boolean).join('\n');
      cells.push(`<mxCell id="${escXml(docId)}" value="${escXml(compactLine(docValue, 60))}" style="shape=document;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#94a3b8;fontSize=10;fontColor=#334155;" vertex="1" parent="1"><mxGeometry x="${lane.x + lane.width - 150}" y="${nodeY + size.height + 10}" width="140" height="44" as="geometry" /></mxCell>`);
      cells.push(edgeCell(`${cellId}-doc-out-edge`, cellId, docId, '', DETAIL_EDGE_STYLES.document));
    }
  });

  layouts.forEach(({ node, kind }, index) => {
    const sourceId = String(node.id || `detail-${index + 1}`);
    const branches = Array.isArray(node.branches) ? node.branches : [];
    branches.forEach((branch, branchIndex) => {
      const targetId = idByNodeId.get(String(branch.target || ''));
      if (!targetId) return;
      const targetIndex = indexById.get(targetId);
      const inferredBackward = Number.isFinite(targetIndex) && targetIndex <= index;
      const edgeType = branch.edge_type || (inferredBackward ? 'return' : 'normal');
      const style = DETAIL_EDGE_STYLES[edgeType] ?? DETAIL_EDGE_STYLES.normal;
      cells.push(edgeCell(`detail-edge-${index + 1}-${branchIndex + 1}`, sourceId, targetId, branch.label || '', style));
    });
    if (branches.length > 0 && !node.next) return;
    if (kind === 'end') return;
    const nextLayout = node.next
      ? layouts[indexById.get(idByNodeId.get(String(node.next)) || '')]
      : layouts[index + 1];
    if (!nextLayout) return;
    const nextId = String(nextLayout.node.id || `detail-${layouts.indexOf(nextLayout) + 1}`);
    cells.push(edgeCell(`detail-edge-${index + 1}`, sourceId, nextId));
  });

  const pageWidth = lanesEndX + 290;
  return `<mxfile host="app.diagrams.net" modified="${now.toISOString()}" agent="5.0" version="24.0.0">
  <diagram name="${escXml(title)}" id="${escXml(title).replace(/[^A-Za-z0-9_-]/g, '-')}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${height + 240}" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

export function asIsFlowToDrawio(flow, title, categoryUpdateNote = '', now = new Date()) {
  const rows = Array.isArray(flow) ? flow : [];
  const rowLayouts = rows.map((step) => {
    const noteCount = [step.resolved_note, step.question].filter(Boolean).length;
    const hasNote = noteCount > 0;
    return {
      boxHeight: isDecision(step) ? 104 + Math.max(0, noteCount - 1) * 20 : (hasNote ? 108 + Math.max(0, noteCount - 1) * 18 : 78),
      rowGap: hasNote || isDecision(step) ? 152 : 122
    };
  });
  const maxRowGap = Math.max(...rowLayouts.map((row) => row.rowGap), 122);
  const processHeight = Math.max(...rowLayouts.map((row) => row.boxHeight), 86);
  const lanes = AS_IS_LANES.map((lane) => ({ ...lane, width: 280 }));
  const rowsWithStyle = rows.map((step) => {
    const burden = step.burden || '—';
    return {
      ...step,
      strokeWidth: burden === '高' ? 3 : 1,
      strokeColor: step.question ? '#d97706' : (burden === '高' ? '#dc2626' : undefined),
      fillColor: step.question ? '#fff2cc' : undefined
    };
  });
  const sectionCells = [];
  const categoryNote = String(categoryUpdateNote || '').replace(/\s+/g, ' ').trim();
  const startY = categoryNote ? 210 : 140;
  if (categoryNote) {
    sectionCells.push(`<mxCell id="category-update-note" value="${escXml(`業務分類更新メモ\n${compactLine(categoryNote, 120)}`)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0284c7;fontSize=12;fontColor=#0f172a;align=left;verticalAlign=top;spacing=8;" vertex="1" parent="1"><mxGeometry x="80" y="66" width="860" height="58" as="geometry" /></mxCell>`);
  }
  let y = startY;
  rows.forEach((step, index) => {
    if (step.section) {
      sectionCells.push(`<mxCell id="section-${index + 1}" value="${escXml(step.section)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=14;fontStyle=1;fontColor=#1e293b;" vertex="1" parent="1"><mxGeometry x="80" y="${y - 34}" width="860" height="24" as="geometry" /></mxCell>`);
    }
    y += maxRowGap;
  });

  const xml = renderFlowToDrawio({
    flow: rowsWithStyle,
    title,
    now,
    lanes,
    lanePrefix: 'asis-lane',
    pageWidth: 1040,
    titleWidth: 880,
    startY,
    rowGap: maxRowGap,
    actorLaneForStep: (step) => lanes.find((lane) => lane.actor === step.actor) || lanes[0],
    valueForStep: (step, index, decision) => {
      const minutes = step.minutes || step.estimated_minutes || '—';
      const burden = step.burden || '—';
      const commonStep = step.common_step ? `共通: ${step.common_step}` : '';
      const unresolvedQuestion = step.question ? `【要確認】${compactLine(step.question)}` : '';
      const resolvedNote = step.resolved_note ? compactLine(step.resolved_note) : '';
      const label = `${step.task_order || index + 1}. ${step.task_name || step.step || `Step ${index + 1}`}`;
      if (decision) {
        return [
          step.condition || label,
          commonStep,
          resolvedNote,
          unresolvedQuestion
        ].filter(Boolean).join('\n');
      }
      return [
        label,
        commonStep,
        `${minutes}分 / 負担: ${burden}`,
        resolvedNote,
        unresolvedQuestion
      ].filter(Boolean).join('\n');
    },
    processSize: { width: 205, height: processHeight },
    decisionSize: { width: 185, height: 110 }
  });

  return xml.replace('<mxCell id="1" parent="0" />', `<mxCell id="1" parent="0" />\n        ${sectionCells.join('\n        ')}`);
}
