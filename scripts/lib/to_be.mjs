import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './fs_utils.mjs';
import { flowToDrawio } from './drawio.mjs';
import { top3BusinessType } from './schema.mjs';

export function writeTop3Drawio(analysis, flowsDir) {
  ensureDir(flowsDir);
  const written = [];
  for (const item of analysis.top3 || []) {
    const rank = item.rank;
    if (!rank) continue;
    const asIsPath = path.join(flowsDir, `top${rank}_as_is.drawio`);
    const toBePath = path.join(flowsDir, `top${rank}_to_be.drawio`);
    if (fs.existsSync(asIsPath)) fs.rmSync(asIsPath);
    fs.writeFileSync(toBePath, flowToDrawio(item.to_be_flow, `Top${rank} To-Be: ${item.title || ''}`));
    delete item.as_is_flow;
    item.flow_files = {
      ...(item.flow_files || {}),
      to_be_drawio: `output/flows/top${rank}_to_be.drawio`
    };
    delete item.flow_files.as_is_drawio;
    written.push(toBePath);
  }
  return written;
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

function fallbackToBeTasksForCell(cell) {
  const effect = cell.estimated_time_saved || '作業時間削減と確認品質の平準化を見込む。';
  const risk = cell.reason || '対象業務のデータ形式、承認条件、例外処理を実装前に確認する。';
  return [
    {
      actor: 'AI',
      to_be_task: `${cell.flow_step || '対象業務'}のAI下書き・照合`,
      ai_role: cell.ai_use_case || '対象タスクの入力情報を読み取り、転記、照合、下書き作成を支援する。',
      human_review: '担当者がAIの出力、根拠、例外候補を確認する。',
      expected_effect: effect,
      prerequisite_or_risk: risk
    },
    {
      actor: 'Human Review',
      to_be_task: '結果確認・承認判断',
      ai_role: '確認観点、差異、注意点を一覧化する。',
      human_review: '担当者または承認者が最終判断し、必要に応じて修正・差戻しを行う。',
      expected_effect: cell.ai_use_case || effect,
      prerequisite_or_risk: cell.development_scale ? `想定開発規模: ${cell.development_scale}` : risk
    }
  ];
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
