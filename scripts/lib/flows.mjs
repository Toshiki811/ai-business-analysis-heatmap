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
