// As-Isフローの分岐健全性(decision well-formedness)を機械検証する。
// 作図ルールの正本は docs/asis_flow_guideline.md。詳細フロー(asis_flow_detail_v1)の
// flow.nodes[] を対象に、verify_outputs.mjs から呼び出される。
//
// 検査内容(§⑤ 分岐健全性):
//   - decision は出口2本以上・行き先2経路以上・condition必須 → error
//   - decision の各枝にラベル → warning
//   - 非decisionが複数経路へ分岐(菱形にし忘れ) → warning
//   - 差戻しエッジが判断ノード数を上回る(逐次チェックの疑い) → soft warning

export function checkFlowStructure(flow, errors = [], warnings = []) {
  const label = `${flow.category || '?'} / ${flow.business_type || '?'}`;
  const nodes = flow.nodes || [];
  let decisionCount = 0;
  let returnEdges = 0;
  for (const node of nodes) {
    const branches = Array.isArray(node.branches) ? node.branches : [];
    returnEdges += branches.filter((b) => b && b.edge_type === 'return').length;
    if (node.node_type === 'decision') {
      decisionCount += 1;
      const targets = new Set(branches.map((b) => String((b && b.target) || '').trim()).filter(Boolean));
      // 出口2本以上(1本なら分岐ではない=process誤分類か片側枝の取りこぼし)
      if (branches.length < 2) {
        errors.push(`flow ${label} decision ${node.id} has ${branches.length} branch (need >=2 outgoing edges)`);
      }
      // 行き先2経路以上(全枝が同一ノードを指す"偽分岐"を弾く)
      if (targets.size < 2) {
        errors.push(`flow ${label} decision ${node.id} resolves to ${targets.size} distinct target(s) (fake branch)`);
      }
      // 各枝にラベル(「一致／不一致」等)
      if (branches.some((b) => !String((b && b.label) || '').trim())) {
        warnings.push(`flow ${label} decision ${node.id} has an unlabeled branch`);
      }
      // 条件は必須
      if (!String(node.condition || '').trim()) {
        errors.push(`flow ${label} decision ${node.id} missing condition`);
      }
    } else {
      // 非decisionが複数経路に分岐している=菱形にし忘れ(取りこぼしの逆検知)。
      // 単一の routing 枝(例外ノードが本流へ戻る等)は正常なので対象外。
      const targets = new Set(branches.map((b) => String((b && b.target) || '').trim()).filter(Boolean));
      if (targets.size >= 2) {
        warnings.push(`flow ${label} node ${node.id} (${node.node_type}) forks to ${targets.size} targets but is not a decision (use node_type "decision")`);
      }
    }
  }
  // 差戻し過多ヒューリスティック: 差戻しエッジが判断ノード数を上回る=逐次チェックの疑い
  if (decisionCount > 0 && returnEdges > decisionCount) {
    warnings.push(`flow ${label} has ${returnEdges} return edges across ${decisionCount} decision(s) — possible scattered rework gates (consolidate validation)`);
  }
  return { errors, warnings };
}

// source_task(業務分類/業務種別/タスク順/タスク名)から一意キーを作る。matrix_tasksとノードで同じ形にする。
export function sourceTaskKey(src) {
  if (!src) return '';
  return ['業務分類', '業務種別', 'タスク順', 'タスク名']
    .map((k) => String(src[k] == null ? '' : src[k]).trim())
    .join('|||');
}

// マトリクスの業務内容詳細の冒頭主語(=主作業主体)を取り出す。「会計責任者が…」→「会計責任者」。
// 「残高差異がある場合に出納職員が…」のように先頭が条件節のときは、それを飛ばして実主語を取る。
export function subjectFromDetail(detail) {
  let text = String(detail || '');
  // 先頭の条件・状況節(〜場合に/場合は/とき/ときは/際に/際は…)を1つ剥がす
  const cond = text.match(/^.*?(?:場合|とき|際)[にはがをで]?[、，]?\s*/);
  if (cond && cond[0].length < text.length) text = text.slice(cond[0].length);
  const m = text.match(/^([^、。\s]+?)が/);
  return m ? m[1].trim() : '';
}

// matrix_tasks[]から source_taskキー → 主作業主体 のインデックスを作る。
export function buildTaskSubjectIndex(matrixTasks = []) {
  const index = new Map();
  for (const task of matrixTasks) {
    const key = sourceTaskKey(task);
    const subject = subjectFromDetail(task['業務内容詳細']);
    if (key && subject) index.set(key, subject);
  }
  return index;
}

// 表記ゆれ吸収: 一方が他方を含めば同一主体とみなす(出納職員 ⊃ 出納)。
function actorMatchesSubject(actor, subject) {
  const a = String(actor || '').trim();
  const s = String(subject || '').trim();
  if (!a || !s) return false;
  return a === s || a.includes(s) || s.includes(a);
}

// 細分化で主作業主体(actor=スイムレーン)がズレるのを機械検出する。
//   (a) ノードの actor が flow.actors[] に無い → 存在しないレーン/表記ゆれ (warning)
//   (b) あるタスクの全ノードから主作業主体が消えている → 分解で主担当が別主体に化けた疑い (warning)
//   (c) actors[] に宣言したのにノードが1つも無い → 空スイムレーン(描画上の空帯) (error)
// subjectByTaskKey は buildTaskSubjectIndex() の戻り値(Map)。
export function checkActorAlignment(flow, subjectByTaskKey = new Map(), errors = [], warnings = []) {
  const label = `${flow.category || '?'} / ${flow.business_type || '?'}`;
  const nodes = flow.nodes || [];
  const declaredActors = (flow.actors || []).map((a) => String(a || '').trim()).filter(Boolean);
  const actorSet = new Set(declaredActors);

  // (c) 宣言した actor(レーン)に1ノードも無い=空スイムレーン。
  // システムをactorに宣言したのに実行アクションをノード化し忘れた典型症状を捕捉。
  // 空レーンは描画上つねに不具合(空の帯+ヘッダだけ)なので error。
  const usedActors = new Set(nodes.map((n) => String(n.actor || '').trim()).filter(Boolean));
  for (const actor of new Set(declaredActors)) {
    if (!usedActors.has(actor)) {
      errors.push(`flow ${label} declared actor "${actor}" but no node is assigned to it (empty swimlane)`);
    }
  }

  // (a) actor が actors[] に存在するか
  for (const node of nodes) {
    const actor = String(node.actor || '').trim();
    if (!actor) continue;
    if (!actorSet.has(actor)) {
      warnings.push(`flow ${label} node ${node.id} actor "${actor}" is not declared in actors[] (orphan swimlane / naming drift)`);
    }
  }

  // (b) タスク単位で主作業主体がノード群に残っているか
  const actorsByTask = new Map();
  for (const node of nodes) {
    const key = sourceTaskKey(node.source_task);
    if (!key) continue;
    if (!actorsByTask.has(key)) actorsByTask.set(key, []);
    actorsByTask.get(key).push(String(node.actor || '').trim());
  }
  for (const [key, actors] of actorsByTask) {
    const subject = subjectByTaskKey.get(key);
    if (!subject) continue; // マトリクスに主体が取れないタスクは対象外
    if (!actors.some((a) => actorMatchesSubject(a, subject))) {
      const taskName = key.split('|||')[3] || key;
      warnings.push(`flow ${label} task "${taskName}" lost its main actor "${subject}" — none of its node actors match (decomposition drift)`);
    }
  }
  return { errors, warnings };
}
