import { normalizeAutomationType, top3BusinessType } from './schema.mjs';

// To-Be フローはブラウザ内インラインSVG(flow_svg.js)で描画する。
// item.to_be_flow(ノード配列)はそのまま analysis に埋め込まれるため、ここでの整形は不要。
// 不要になった as_is_flow / flow_files(draw.ioパス)だけ取り除く。
export function stripTop3DrawioArtifacts(analysis) {
  for (const item of analysis.top3 || []) {
    delete item.as_is_flow;
    if (item.flow_files) {
      delete item.flow_files.as_is_drawio;
      delete item.flow_files.to_be_drawio;
      if (Object.keys(item.flow_files).length === 0) delete item.flow_files;
    }
  }
}

function cellHeatmapGroup(cell) {
  return cell.heatmap_group || cell.target_heatmap_group || '';
}

function top3HeatmapGroup(item) {
  return item.target_heatmap_group || item.heatmap_group || '';
}

function findTop3ForCell(analysis, cell) {
  return (analysis.top3 || []).find((item) =>
    item.target_category === cell.category &&
    top3BusinessType(item) === (cell.business_type || '') &&
    item.target_flow_step === cell.flow_step &&
    (!cellHeatmapGroup(cell) || !top3HeatmapGroup(item) || top3HeatmapGroup(item) === cellHeatmapGroup(cell))
  );
}

function toBeTasksFromTop3(item) {
  return (item.to_be_flow || [])
    .filter((step) => (step.node_type || 'process') !== 'decision')
    .slice(0, 5)
    .map((step) => ({
      actor: step.actor || 'AI',
      to_be_task: step.step || '',
      ai_role: step.actor === 'AI' ? (step.description || '') : '',
      human_review: step.actor === 'Human Review' ? (step.description || '') : 'AI出力の根拠、例外、承認要否を人が確認する。',
      expected_effect: item.expected_effect || '',
      prerequisite_or_risk: item.risks || ''
    }));
}

function useCaseDetail(cell) {
  const detail = cell.ai_use_case_detail;
  if (!detail || typeof detail !== 'object') return null;
  const input = String(detail.input || '').trim();
  const process = String(detail.process || '').trim();
  const output = String(detail.output || '').trim();
  if (!input && !process && !output) return null;
  return { input, process, output };
}

function ioSummary(cell, fallback) {
  const detail = useCaseDetail(cell);
  if (!detail) return fallback;
  return [detail.input, detail.process, detail.output].filter(Boolean).join(' → ');
}

function fallbackToBeTasksForCell(cell) {
  const effect = cell.estimated_time_saved || '作業時間削減と確認品質の平準化を見込む。';
  const risk = cell.reason || '対象業務のデータ形式、承認条件、例外処理を実装前に確認する。';
  const automationType = normalizeAutomationType(cell.automation_type);
  const target = cell.flow_step || '対象業務';

  if (automationType === 'rule_based' || automationType === 'system_config') {
    const means = automationType === 'system_config' ? '既存システムの設定・標準機能' : '条件表のルール実装';
    return [
      {
        actor: 'System',
        automation_type: automationType,
        to_be_task: `${target}の${automationType === 'system_config' ? 'システム設定化' : 'ルールベース自動化'}`,
        ai_role: '',
        human_review: `判断条件（金額閾値・期日・対応表）を条件表に整理し、${means}として実装する。AI導入は不要。`,
        expected_effect: effect,
        prerequisite_or_risk: cell.automation_reason || risk
      },
      {
        actor: 'Human',
        automation_type: automationType,
        to_be_task: '設定・ルールの定期点検',
        ai_role: '',
        human_review: '担当者が条件表と実運用の乖離を定期的に点検し、規程改定時に設定を更新する。',
        expected_effect: '判断基準の属人化解消と運用の安定化。',
        prerequisite_or_risk: cell.development_scale ? `想定開発規模: ${cell.development_scale}` : risk
      }
    ];
  }

  if (automationType === 'rpa') {
    return [
      {
        actor: 'System',
        automation_type: automationType,
        to_be_task: `${target}のRPA・システム間連携化`,
        ai_role: '',
        human_review: ioSummary(cell, '構造化データの転記・入力・突合を連携処理として自動化する。AI導入は不要。'),
        expected_effect: effect,
        prerequisite_or_risk: cell.automation_reason || risk
      },
      {
        actor: 'Human Review',
        automation_type: automationType,
        to_be_task: '連携結果の確認',
        ai_role: '',
        human_review: '担当者が連携エラー・突合不一致の一覧を確認し、例外のみ手動対応する。',
        expected_effect: '転記ミスの解消と例外対応への集中。',
        prerequisite_or_risk: cell.development_scale ? `想定開発規模: ${cell.development_scale}` : risk
      }
    ];
  }

  if (automationType === 'manual') {
    return [
      {
        actor: 'Human',
        automation_type: automationType,
        to_be_task: `${target}は人手を維持`,
        ai_role: '',
        human_review: cell.automation_reason || '判断が属人的・非定型で自動化に不適なため、現行の人手運用を維持する。',
        expected_effect: '無理な自動化による品質低下の回避。',
        prerequisite_or_risk: '業務手順の文書化が進めば再評価する。'
      }
    ];
  }

  // generative_ai / ai_agent / automation_type未設定(旧JSON)
  const tasks = [
    {
      actor: 'AI',
      automation_type: automationType || '',
      to_be_task: `${target}のAI下書き・照合`,
      ai_role: ioSummary(cell, cell.ai_use_case || '対象タスクの入力情報を読み取り、転記、照合、下書き作成を支援する。'),
      human_review: '担当者がAIの出力、根拠、例外候補を確認する。',
      expected_effect: effect,
      prerequisite_or_risk: risk
    },
    {
      actor: 'Human Review',
      automation_type: automationType || '',
      to_be_task: '結果確認・承認判断',
      ai_role: '確認観点、差異、注意点を一覧化する。',
      human_review: '担当者または承認者が最終判断し、必要に応じて修正・差戻しを行う。',
      expected_effect: cell.ai_use_case || effect,
      prerequisite_or_risk: cell.development_scale ? `想定開発規模: ${cell.development_scale}` : risk
    }
  ];
  if (automationType === 'ai_agent') {
    tasks.push({
      actor: 'System',
      automation_type: automationType,
      to_be_task: '例外時の自動停止・確認キュー積み',
      ai_role: '処理の信頼度が閾値未満・突合不能の場合は自動処理を停止し、対象を担当者の確認リストへ積む。',
      human_review: '担当者が確認キューの案件を処理し、判断結果をエージェントの判断基準へ反映する。',
      expected_effect: '誤処理の流出防止と例外パターンの継続的な取り込み。',
      prerequisite_or_risk: cell.automation_reason || risk
    });
  }
  return tasks;
}

export function ensureHeatmapToBeTasks(analysis) {
  let updated = 0;
  for (const cell of analysis.heatmap_cells || []) {
    if (Array.isArray(cell.to_be_tasks) && cell.to_be_tasks.length > 0) continue;
    const top3 = findTop3ForCell(analysis, cell);
    const fromTop3 = top3 ? toBeTasksFromTop3(top3) : [];
    cell.to_be_tasks = fromTop3.length ? fromTop3 : fallbackToBeTasksForCell(cell);
    updated += 1;
  }
  analysis.metadata = {
    ...(analysis.metadata || {}),
    to_be_tasks_generated_count: updated,
    to_be_tasks_cell_count: (analysis.heatmap_cells || []).filter((cell) =>
      Array.isArray(cell.to_be_tasks) && cell.to_be_tasks.length > 0
    ).length
  };
  return updated;
}
