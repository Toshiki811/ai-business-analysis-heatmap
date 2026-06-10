import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureDir } from './fs_utils.mjs';
import { asIsFlowToDrawio, flowToDrawio } from './drawio.mjs';

function compactText(value, maxLength = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function questionKey(parts) {
  return [
    parts.category || '',
    parts.task_type || '',
    parts.task_name || '',
    parts.question || ''
  ].join('|||');
}

function findTaskForResolvedQuestion(tasks, resolved) {
  return tasks.find((task) =>
    (task['業務分類'] || '') === (resolved.category || '') &&
    (task['業務種別'] || '') === (resolved.task_type || '') &&
    (task['タスク名'] || '') === (resolved.task_name || '')
  );
}

function classifyAsIsAnswerImpact(question, answer) {
  const questionText = String(question || '');
  const text = `${questionText} ${answer || ''}`;
  if (/資料形式|出力できるか|出力可否/.test(questionText) && !/連携/.test(questionText)) return 'none';
  if (/担当|承認|決裁|レビュー|確認者|上長|責任者/.test(text)) return 'role';
  if (/順序|先に|後で|前後|戻し先|差戻|再承認/.test(text)) return 'sequence';
  if (/分岐|条件|場合|例外|不一致|エラー|修正/.test(text)) return 'branch';
  if (/システム|連携|取込|入力|登録|出力|CSV|Excel|アップロード|ダウンロード|データ/.test(text)) return 'system';
  return 'none';
}

function asIsResolvedNote(question, answer) {
  const impact = classifyAsIsAnswerImpact(question, answer);
  const prefix = impact === 'none' ? '回答確認済み（フロー変更なし）' : '回答反映';
  return {
    impact,
    note: `${prefix}: ${compactText(answer, 60)}`
  };
}

function buildAnswerExample(question) {
  const text = String(question || '');
  if (/レビュー|差戻/.test(text)) {
    return '事務長がレビューし、不備がある場合は担当者へ差戻す';
  }
  if (/承認|決裁|稟議/.test(text)) {
    return '担当者が作成し、会計責任者が承認する';
  }
  if (/担当|割当|責任者/.test(text)) {
    return '担当者が一次対応し、確認者が内容をチェックする';
  }
  if (/分岐|条件|例外|不一致|差異|乖離|エラー/.test(text)) {
    return '基準外の場合は担当者が原因確認し、上長確認後に修正する';
  }
  if (/連携|取込|入力|登録|出力|システム|データ|CSV/.test(text)) {
    return 'CSVで出力し、会計システムへ取込後に担当者が結果を確認する';
  }
  if (/電子|保管|証憑|帳票|台帳|写真|ラベル/.test(text)) {
    return '電子保管し、月次で担当者が台帳との突合を行う';
  }
  if (/期限|期日|頻度|日/.test(text)) {
    return '翌営業日までに担当者が処理し、月次で上長が確認する';
  }
  return '担当者が処理し、必要に応じて上長または会計責任者が確認する';
}

function normalizeQuestionWithExample(question) {
  const text = String(question || '').trim();
  if (!text || /回答例:/.test(text)) return text;
  const normalizedQuestion = text.startsWith('質問:') ? text : `質問: ${text}`;
  return `${normalizedQuestion} / 回答例: ${buildAnswerExample(text)}`;
}

function extractQuestionText(question) {
  return String(question || '')
    .replace(/^質問:\s*/, '')
    .split(/\s*\/\s*回答例:/)[0]
    .trim();
}

function hasFlowChangingQuestion(question) {
  const text = extractQuestionText(question);
  return /差戻|再承認|承認フロー|承認手順|承認者ID|作成者ID|分離状況|承認権限|承認有無|レビュー者|レビューの担当者|例外|分岐|判断ルール|判断基準|基準額|乖離率|対象基準|事前承認省略|提出前確認者|チェック担当|二重チェック|立会者|担当者割当|担当者と|承認者と|承認資料|稟議|修正|不一致|エラー|差異発生時|不明残高|再振込|少額支払|契約金額別|連携可否|取込可否|自動取込|仕訳連携|システム連携/.test(text);
}

function hasNonFlowQuestion(question) {
  const text = extractQuestionText(question);
  return /資料形式|件数|頻度|所要時間|AI導入余地|出力できるか|出力可否|出力できない|保管場所|保管方法|管理媒体|フォーマット|標準様式|電子保管|電子化状況|電子回収|電子請求|電子送付|受領方法|データ化|管理方法|回収確認方法|チェックリスト有無|テンプレート有無|内製しているか外部専門家|提出先|添付資料|必要添付資料|領収書原本管理|ラベル|写真|上限額|支払対象|利用範囲/.test(text);
}

function questionAnsweredByTaskText(task) {
  const question = extractQuestionText(task['確認事項']);
  const detail = [
    task['タスク名'],
    task['業務内容詳細'],
    task['現状課題']
  ].filter(Boolean).join(' ');

  const asksRole = /担当|責任者|確認者|承認者|承認|レビュー者/.test(question);
  const roleKnown = /理事長|会計責任者|出納職員|担当者|契約担当者|固定資産管理責任者|予算管理責任者|理事会|承認済み/.test(detail);
  const needsRoleDetail = /差戻|再承認|分離状況|承認手順|承認フロー|承認者ID|作成者ID|レビュー者|二重チェック|立会者|担当者割当/.test(question);
  if (asksRole && roleKnown && !needsRoleDetail) return true;

  const asksSystem = /システム|取込|入力|出力|連携|電子/.test(question);
  const systemKnown = /会計システム|給与計算システム|給与計算ソフト|請求システム|インターネットバンキング|総合振込/.test(detail);
  const needsSystemDetail = /連携可否|取込可否|自動取込|仕訳連携|システム連携/.test(question);
  if (asksSystem && systemKnown && !needsSystemDetail) return true;

  const asksOrder = /順序|期限|期日|前後/.test(question);
  const orderKnown = /後|前|期日|月末|年度末|承認済み.*もとに|場合/.test(detail);
  return asksOrder && orderKnown;
}

function shouldKeepQuestion(task) {
  const question = String(task['確認事項'] || '').trim();
  if (!question) return false;
  if (String(task['クライアント回答'] || '').trim()) return true;
  if (/（確認不要）/.test(question)) return false;
  if (questionAnsweredByTaskText(task)) return false;
  if (hasFlowChangingQuestion(question)) return true;
  if (hasNonFlowQuestion(question)) return false;
  return false;
}

function suppressNonFlowQuestions(analysis) {
  let suppressed = 0;
  for (const task of analysis.matrix_tasks || []) {
    if (task.as_is_suppressed_question && !task['確認事項']) suppressed += 1;
    delete task.as_is_suppressed_question;
    if (!task['確認事項']) continue;
    if (shouldKeepQuestion(task)) continue;
    task['確認事項'] = '';
    suppressed += 1;
  }
  return suppressed;
}

function ensureQuestionAnswerExamples(analysis) {
  for (const task of analysis.matrix_tasks || []) {
    if (!task['確認事項']) continue;
    task['確認事項'] = normalizeQuestionWithExample(task['確認事項']);
  }
}

function applyResolvedQuestionToTask(task, resolved) {
  const answer = String(resolved.answer || '').trim();
  const updateNote = String(resolved.as_is_update_note || '').trim();
  if (!answer && !updateNote) return;
  if (answer) {
    const { impact, note } = asIsResolvedNote(resolved.question, answer);
    task.as_is_answer_impact = impact;
    task.as_is_resolved_note = note;
    task.as_is_resolved_answer = answer;
  }
  task.as_is_resolved_question = resolved.question || '';
  if (updateNote) {
    task.as_is_update_note = updateNote;
    task['As-Isフロー更新内容'] = updateNote;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;
  const source = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(value);
      value = '';
    } else if (ch === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (ch !== '\r') {
      value += ch;
    }
  }
  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => String(header || '').trim());
  return rows.slice(1)
    .filter((cols) => cols.some((col) => String(col || '').trim()))
    .map((cols) => Object.fromEntries(headers.map((header, index) => [header, cols[index] || ''])));
}

function latestClientInputFile(root) {
  const sourceDir = path.join(root, 'input', 'source');
  if (!fs.existsSync(sourceDir)) return null;
  const files = fs.readdirSync(sourceDir)
    .filter((name) => /^client_input_filled(?:_\d{8})?\.csv$/i.test(name))
    .map((name) => {
      const filePath = path.join(sourceDir, name);
      return { name, filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0] || null;
}

function clientInputTaskKey(row) {
  return [
    row['業務分類'] || '',
    row['業務種別'] || '',
    row['タスク順'] || '',
    row['マトリクス横軸'] || '',
    row['タスク名'] || ''
  ].map((value) => String(value || '').trim()).join('|||');
}

function matrixTaskKey(task) {
  return [
    task['業務分類'] || '',
    task['業務種別'] || '',
    task['タスク順'] || '',
    getTaskMatrixAxis(task),
    task['タスク名'] || ''
  ].map((value) => String(value || '').trim()).join('|||');
}

function fallbackClientInputTaskKey(row) {
  return [
    row['業務分類'] || '',
    row['業務種別'] || '',
    row['タスク名'] || ''
  ].map((value) => String(value || '').trim()).join('|||');
}

function fallbackMatrixTaskKey(task) {
  return [
    task['業務分類'] || '',
    task['業務種別'] || '',
    task['タスク名'] || ''
  ].map((value) => String(value || '').trim()).join('|||');
}

function ensureCategoryUpdateMap(analysis) {
  if (!analysis.as_is_category_updates || typeof analysis.as_is_category_updates !== 'object' || Array.isArray(analysis.as_is_category_updates)) {
    analysis.as_is_category_updates = {};
  }
  return analysis.as_is_category_updates;
}

function appendLegacyCategoryUpdate(categoryUpdates, category, note) {
  const normalizedCategory = String(category || '').trim();
  const normalizedNote = String(note || '').trim();
  if (!normalizedCategory || !normalizedNote) return false;
  const existing = String(categoryUpdates[normalizedCategory] || '').trim();
  if (!existing) {
    categoryUpdates[normalizedCategory] = normalizedNote;
    return true;
  }
  const parts = existing.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  if (!parts.includes(normalizedNote)) {
    categoryUpdates[normalizedCategory] = `${existing} / ${normalizedNote}`;
    return true;
  }
  return false;
}

function categoryUpdateNote(analysis, category) {
  const categoryUpdates = ensureCategoryUpdateMap(analysis);
  return String(categoryUpdates[String(category || '').trim()] || '').trim();
}

export function applyLatestClientInput(analysis, root) {
  const latest = latestClientInputFile(root);
  if (!latest) return { file: '', rows: 0, applied: 0 };

  const rows = parseCsv(fs.readFileSync(latest.filePath, 'utf8'));
  const categoryUpdates = ensureCategoryUpdateMap(analysis);
  const byFullKey = new Map();
  const byFallbackKey = new Map();
  for (const task of analysis.matrix_tasks || []) {
    byFullKey.set(matrixTaskKey(task), task);
    const fallbackKey = fallbackMatrixTaskKey(task);
    if (!byFallbackKey.has(fallbackKey)) byFallbackKey.set(fallbackKey, task);
  }

  let applied = 0;
  for (const row of rows) {
    const task = byFullKey.get(clientInputTaskKey(row)) || byFallbackKey.get(fallbackClientInputTaskKey(row));
    if (!task) continue;

    const answer = String(row['クライアント回答'] || '').trim();
    const category = String(row['業務分類'] || task['業務分類'] || '').trim();
    const categoryUpdate = String(row['As-Isフロー更新内容_業務分類'] || '').trim();
    const legacyUpdate = String(row['As-Isフロー更新内容'] || '').trim();
    const timeAfter = String(row['1件あたり所要時間_分_ヒアリング後'] || '').trim();
    const burdenAfter = String(row['人手の負担_ヒアリング後'] || '').trim();
    const volume = String(row['月間件数'] || '').trim();

    if (answer) task['クライアント回答'] = answer;
    if (categoryUpdate && category) categoryUpdates[category] = categoryUpdate;
    if (!categoryUpdate && legacyUpdate) appendLegacyCategoryUpdate(categoryUpdates, category, legacyUpdate);
    if (timeAfter) task['1件あたり所要時間_分_ヒアリング後'] = timeAfter;
    if (burdenAfter) task['人手の負担_ヒアリング後'] = burdenAfter;
    if (volume) task['月間件数'] = volume;
    if (answer || categoryUpdate || legacyUpdate || timeAfter || burdenAfter || volume) applied += 1;
  }

  analysis.metadata = {
    ...(analysis.metadata || {}),
    client_input: latest.name,
    client_input_applied_rows: applied
  };
  return { file: latest.filePath, rows: rows.length, applied };
}

function applyResolvedQuestionsToTasks(analysis) {
  const tasks = Array.isArray(analysis.matrix_tasks) ? analysis.matrix_tasks : [];
  const resolvedQuestions = Array.isArray(analysis.resolved_questions) ? analysis.resolved_questions : [];
  for (const resolved of resolvedQuestions) {
    const task = findTaskForResolvedQuestion(tasks, resolved);
    if (task) applyResolvedQuestionToTask(task, resolved);
  }
}

export function resolveQuestions(analysis) {
  ensureQuestionAnswerExamples(analysis);
  const resolved = [];
  const existing = Array.isArray(analysis.resolved_questions) ? analysis.resolved_questions : [];
  const seen = new Set(existing.map((item) => questionKey(item)));

  for (const task of analysis.matrix_tasks || []) {
    const answer = String(task['クライアント回答'] || '').trim();
    const updateNote = String(task.as_is_update_note || task['As-Isフロー更新内容'] || '').trim();
    if (!answer && !updateNote) continue;
    if (!answer) {
      task.as_is_update_note = updateNote;
      task['As-Isフロー更新内容'] = updateNote;
      continue;
    }
    const item = {
      category: task['業務分類'] || '',
      task_type: task['業務種別'] || '',
      task_name: task['タスク名'] || '',
      question: task['確認事項'] || '',
      answer: task['クライアント回答'] || '',
      as_is_update_note: updateNote,
      applied_to: ['matrix_tasks', 'heatmap_cells.reason', 'as_is_flow', 'to_be_flow']
    };
    if (!seen.has(questionKey(item))) {
      resolved.push(item);
      seen.add(questionKey(item));
    }
    applyResolvedQuestionToTask(task, item);
    task['確認事項'] = '';
    task['クライアント回答'] = '';
    task['区分'] = 'ヒアリング済';
  }

  const suppressedCount = suppressNonFlowQuestions(analysis);
  analysis.metadata = {
    ...(analysis.metadata || {}),
    suppressed_question_count: suppressedCount
  };

  if (resolved.length > 0) {
    analysis.resolved_questions = [...existing, ...resolved];
  } else if (!Array.isArray(analysis.resolved_questions)) {
    analysis.resolved_questions = [];
  }

  applyResolvedQuestionsToTasks(analysis);
  return resolved;
}

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

function slugify(value) {
  const normalized = String(value || 'unknown').normalize('NFKC').trim();
  const slug = normalized
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug || 'unknown';
}

function hashId(value, prefix = 'task') {
  return `${prefix}_${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10)}`;
}

function getTaskMinutes(task) {
  return task['1件あたり所要時間_分_ヒアリング後'] || task['所要時間_分'] || task['1件あたり所要時間_分'] || task.estimated_minutes || '';
}

function getTaskMatrixAxis(task) {
  return task['マトリクス横軸'] || task.matrix_axis || task['共通ステップ'] || task.common_step || task['タスク名'] || '';
}

function getTaskHeatmapStep(task) {
  return task['ヒートマップステップ'] || task.heatmap_step || task['共通ステップ'] || task.common_step || getTaskMatrixAxis(task);
}

function normalizeColumnGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      group: String(group?.group || group?.name || '').trim(),
      steps: (Array.isArray(group?.steps) ? group.steps : [])
        .map((step) => String(step || '').trim())
        .filter(Boolean)
    }))
    .filter((group) => group.group || group.steps.length > 0);
}

function columnStepGroupMap(groups) {
  const map = new Map();
  for (const group of normalizeColumnGroups(groups)) {
    for (const step of group.steps) {
      if (!map.has(step)) map.set(step, group.group);
    }
  }
  return map;
}

function inferHeatmapGroup(analysis, step) {
  const normalizedStep = String(step || '').trim();
  if (!normalizedStep) return '';
  const fromHeatmap = columnStepGroupMap(analysis.heatmap_columns).get(normalizedStep);
  if (fromHeatmap) return fromHeatmap;
  const fromFlow = columnStepGroupMap(analysis.flow_columns).get(normalizedStep);
  return fromFlow || '';
}

function deriveHeatmapColumns(analysis) {
  const baseColumns = normalizeColumnGroups(analysis.heatmap_columns || analysis.flow_columns);
  if (baseColumns.length > 0) return baseColumns;

  const groupMap = new Map();
  for (const cell of analysis.heatmap_cells || []) {
    const step = String(cell.flow_step || '').trim();
    if (!step) continue;
    const group = String(cell.heatmap_group || 'AI導入効果').trim();
    if (!groupMap.has(group)) groupMap.set(group, []);
    const steps = groupMap.get(group);
    if (!steps.includes(step)) steps.push(step);
  }

  return [...groupMap.entries()].map(([group, steps]) => ({ group, steps }));
}

function deriveCategoryFlowColumns(analysis) {
  const categoryMap = new Map();
  for (const task of analysis.matrix_tasks || []) {
    const category = String(task['業務分類'] || task.category || '未分類').trim();
    const group = String(task['ヒートマップグループ'] || task.heatmap_group || '業務ステップ').trim();
    const matrixAxis = String(getTaskMatrixAxis(task) || '').trim();
    if (!matrixAxis) continue;
    if (!categoryMap.has(category)) categoryMap.set(category, new Map());
    const groupMap = categoryMap.get(category);
    if (!groupMap.has(group)) groupMap.set(group, []);
    const steps = groupMap.get(group);
    if (!steps.includes(matrixAxis)) steps.push(matrixAxis);
  }

  return Object.fromEntries([...categoryMap.entries()].map(([category, groupMap]) => [
    category,
    [...groupMap.entries()].map(([group, steps]) => ({ group, steps }))
  ]));
}

function normalizeEffectLevel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === '高' || text === 'high') return 'high';
  if (text === '中' || text === 'medium') return 'medium';
  if (text === '低' || text === 'low') return 'low';
  return text || 'low';
}

export function normalizeAnalysisSchema(analysis) {
  const stats = {
    matrix_tasks_normalized: 0,
    heatmap_cells_normalized: 0,
    category_flow_columns_generated: false,
    heatmap_columns_generated: false
  };

  analysis.matrix_tasks = Array.isArray(analysis.matrix_tasks) ? analysis.matrix_tasks : [];
  analysis.heatmap_cells = Array.isArray(analysis.heatmap_cells) ? analysis.heatmap_cells : [];
  analysis.top3 = Array.isArray(analysis.top3) ? analysis.top3 : [];

  const heatmapColumns = deriveHeatmapColumns(analysis);
  if (!Array.isArray(analysis.heatmap_columns) || analysis.heatmap_columns.length === 0) {
    analysis.heatmap_columns = heatmapColumns;
    stats.heatmap_columns_generated = true;
  } else {
    analysis.heatmap_columns = normalizeColumnGroups(analysis.heatmap_columns);
  }
  if (!Array.isArray(analysis.flow_columns) || analysis.flow_columns.length === 0) {
    analysis.flow_columns = analysis.heatmap_columns;
  } else {
    analysis.flow_columns = normalizeColumnGroups(analysis.flow_columns);
  }

  for (const task of analysis.matrix_tasks) {
    const before = [
      task['マトリクス横軸'],
      task['ヒートマップグループ'],
      task['ヒートマップステップ']
    ].join('|');
    const matrixAxis = String(getTaskMatrixAxis(task) || '').trim();
    const heatmapStep = String(getTaskHeatmapStep(task) || matrixAxis).trim();
    const heatmapGroup = String(task['ヒートマップグループ'] || task.heatmap_group || inferHeatmapGroup(analysis, heatmapStep)).trim();
    task['マトリクス横軸'] = matrixAxis;
    task['ヒートマップグループ'] = heatmapGroup;
    task['ヒートマップステップ'] = heatmapStep;
    const after = [
      task['マトリクス横軸'],
      task['ヒートマップグループ'],
      task['ヒートマップステップ']
    ].join('|');
    if (before !== after) stats.matrix_tasks_normalized += 1;
  }

  for (const cell of analysis.heatmap_cells) {
    const before = [cell.heatmap_group, cell.effect_level].join('|');
    cell.category = cell.category || cell['業務分類'] || '';
    cell.business_type = cell.business_type || cell['業務種別'] || '';
    cell.flow_step = cell.flow_step || cell['ヒートマップステップ'] || cell.common_step || '';
    cell.heatmap_group = cell.heatmap_group || inferHeatmapGroup(analysis, cell.flow_step);
    cell.effect_level = normalizeEffectLevel(cell.effect_level);
    const after = [cell.heatmap_group, cell.effect_level].join('|');
    if (before !== after) stats.heatmap_cells_normalized += 1;
  }

  for (const item of analysis.top3) {
    item.target_business_type = top3BusinessType(item);
    item.target_heatmap_group = item.target_heatmap_group || inferHeatmapGroup(analysis, item.target_flow_step);
  }

  if (!Array.isArray(analysis.categories) || analysis.categories.length === 0) {
    analysis.categories = [...new Set(analysis.matrix_tasks.map((task) => task['業務分類']).filter(Boolean))];
  }

  if (!analysis.category_flow_columns || Object.keys(analysis.category_flow_columns).length === 0) {
    analysis.category_flow_columns = deriveCategoryFlowColumns(analysis);
    stats.category_flow_columns_generated = true;
  }

  analysis.metadata = {
    ...(analysis.metadata || {}),
    schema_version: new Date().toISOString().slice(0, 10),
    schema_normalized_at: analysis.metadata?.created_at || ''
  };

  return stats;
}

export function validateAnalysisContract(analysis) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(analysis.matrix_tasks) || analysis.matrix_tasks.length === 0) errors.push('matrix_tasks is missing or empty');
  if (!Array.isArray(analysis.heatmap_cells) || analysis.heatmap_cells.length === 0) errors.push('heatmap_cells is missing or empty');
  if (!Array.isArray(analysis.top3) || analysis.top3.length === 0) errors.push('top3 is missing or empty');
  else if (analysis.top3.length !== 3) warnings.push(`top3 has ${analysis.top3.length} item(s); expected 3`);
  if (!analysis.category_flow_columns || Object.keys(analysis.category_flow_columns).length === 0) errors.push('category_flow_columns is missing');
  if (!Array.isArray(analysis.heatmap_columns) || analysis.heatmap_columns.length === 0) errors.push('heatmap_columns is missing or empty');

  (analysis.matrix_tasks || []).forEach((task, index) => {
    for (const key of ['業務分類', '業務種別', 'タスク名', 'マトリクス横軸', 'ヒートマップグループ', 'ヒートマップステップ']) {
      if (!String(task[key] || '').trim()) errors.push(`matrix_tasks[${index}] missing ${key}`);
    }
  });

  (analysis.heatmap_cells || []).forEach((cell, index) => {
    for (const key of ['category', 'business_type', 'heatmap_group', 'flow_step', 'reason', 'effect_level']) {
      if (!String(cell[key] || '').trim()) errors.push(`heatmap_cells[${index}] missing ${key}`);
    }
    if (!['high', 'medium', 'low', '高', '中', '低'].includes(String(cell.effect_level || '').trim())) {
      errors.push(`heatmap_cells[${index}] invalid effect_level: ${cell.effect_level}`);
    }
  });

  (analysis.top3 || []).forEach((item, index) => {
    for (const key of ['rank', 'title', 'target_category', 'target_business_type', 'target_heatmap_group', 'target_flow_step']) {
      if (!String(item[key] || '').trim()) errors.push(`top3[${index}] missing ${key}`);
    }
    if (!Array.isArray(item.to_be_flow) || item.to_be_flow.length === 0) {
      errors.push(`top3[${index}] missing to_be_flow`);
    }
  });

  if (warnings.length > 0) {
    console.warn(`[validation warnings]\n${warnings.join('\n')}`);
  }
  if (errors.length > 0) {
    throw new Error(`Analysis contract validation failed:\n${errors.slice(0, 40).join('\n')}${errors.length > 40 ? `\n...and ${errors.length - 40} more` : ''}`);
  }

  return true;
}

function inferAsIsActor(task) {
  const text = [
    task['タスク名'],
    task['業務内容詳細'],
    task['現状課題'],
    task['クライアント回答'],
    task.as_is_resolved_answer,
    task.as_is_update_note
  ].filter(Boolean).join(' ').replace(/承認済み/g, '');
  if (/システム|入力|登録|取込|連携|出力|自動|データ|CSV|アップロード|ダウンロード/.test(text)) {
    return 'システム';
  }
  if (/承認|決裁|上長|管理者|確認者|レビュー|差戻|再承認/.test(text)) {
    return '上長・管理者・承認者';
  }
  return '担当者・業務部門';
}

function sortTasksByOrder(a, b) {
  const orderA = Number(a['タスク順']);
  const orderB = Number(b['タスク順']);
  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) return orderA - orderB;
  return String(a['タスク名'] || '').localeCompare(String(b['タスク名'] || ''), 'ja');
}

function groupMatrixTasks(tasks) {
  const categoryMap = new Map();
  for (const task of tasks) {
    const category = task['業務分類'] || task.category || '未分類';
    const businessType = task['業務種別'] || task.business_type || '未分類';
    if (!categoryMap.has(category)) categoryMap.set(category, new Map());
    const typeMap = categoryMap.get(category);
    if (!typeMap.has(businessType)) typeMap.set(businessType, []);
    typeMap.get(businessType).push(task);
  }
  for (const typeMap of categoryMap.values()) {
    for (const rows of typeMap.values()) rows.sort(sortTasksByOrder);
  }
  return categoryMap;
}

function buildAsIsStep(task, section, nodeId) {
  return {
    task_id: task.task_id,
    node_id: nodeId,
    section,
    task_order: task['タスク順'] || '',
    common_step: getTaskMatrixAxis(task),
    heatmap_group: task['ヒートマップグループ'] || task.heatmap_group || '',
    heatmap_step: getTaskHeatmapStep(task),
    task_name: task['タスク名'] || '',
    actor: inferAsIsActor(task),
    description: task['業務内容詳細'] || '',
    issue: task['現状課題'] || '',
    question: task['確認事項'] || '',
    resolved_note: task.as_is_resolved_note || '',
    update_note: task.as_is_update_note || task['As-Isフロー更新内容'] || '',
    answer_impact: task.as_is_answer_impact || '',
    burden: task['人手の負担'] || '',
    minutes: getTaskMinutes(task)
  };
}

export function writeAsIsDrawio(analysis, flowsDir, dateKey) {
  ensureDir(flowsDir);
  suppressNonFlowQuestions(analysis);
  const tasks = Array.isArray(analysis.matrix_tasks) ? analysis.matrix_tasks : [];
  const categoryMap = groupMatrixTasks(tasks);
  const categoryFlows = [];
  const businessTypeFlows = [];
  const categoryFlowIndex = {};
  const written = [];

  categoryMap.forEach((typeMap, category) => {
    const categorySlug = slugify(category);
    const categoryFlowKey = `asis_${categorySlug}_${dateKey}`;
    const categoryFlowFile = `output/flows/${categoryFlowKey}.drawio`;
    const updateNote = categoryUpdateNote(analysis, category);
    const categorySteps = [];
    const categoryTaskIds = [];
    let nodeIndex = 1;

    typeMap.forEach((rows, businessType) => {
      const section = businessType;
      rows.forEach((task, rowIndex) => {
        const taskIdSource = [
          category,
          businessType,
          task['タスク順'] || rowIndex + 1,
          getTaskMatrixAxis(task),
          task['タスク名'] || ''
        ].join('|');
        task.task_id = task.task_id || hashId(taskIdSource);
        const nodeId = `process-${String(nodeIndex).padStart(3, '0')}`;
        task.as_is_category_flow_key = categoryFlowKey;
        task.as_is_node_id = nodeId;
        const matrixAxis = getTaskMatrixAxis(task);
        task.as_is_position_label = `${category} > ${businessType} > ${task['タスク順'] || rowIndex + 1}. ${task['タスク名'] || ''}${matrixAxis ? ` / ${matrixAxis}` : ''}`;
        categorySteps.push(buildAsIsStep(task, rowIndex === 0 ? section : '', nodeId));
        categoryTaskIds.push(task.task_id);
        nodeIndex += 1;
      });
    });

    const categoryPath = path.join(flowsDir, `${categoryFlowKey}.drawio`);
    fs.writeFileSync(categoryPath, asIsFlowToDrawio(categorySteps, `As-Is 全体: ${category}`, updateNote));
    written.push(categoryPath);

    const childFlowKeys = [];
    typeMap.forEach((rows, businessType) => {
      const businessSlug = slugify(businessType);
      const businessFlowKey = `asis_${categorySlug}__${businessSlug}_${dateKey}`;
      const businessFlowFile = `output/flows/${businessFlowKey}.drawio`;
      const businessSteps = rows.map((task, index) => {
        task.as_is_business_type_flow_key = businessFlowKey;
        return buildAsIsStep(task, index === 0 ? businessType : '', task.as_is_node_id);
      });
      const businessPath = path.join(flowsDir, `${businessFlowKey}.drawio`);
      fs.writeFileSync(businessPath, asIsFlowToDrawio(businessSteps, `As-Is 部分: ${category} / ${businessType}`, updateNote));
      written.push(businessPath);
      childFlowKeys.push(businessFlowKey);
      businessTypeFlows.push({
        category,
        business_type: businessType,
        flow_key: businessFlowKey,
        flow_file: businessFlowFile,
        category_flow_key: categoryFlowKey,
        category_update_note: updateNote,
        source_task_ids: rows.map((task) => task.task_id),
        steps: businessSteps
      });
    });

    categoryFlows.push({
      category,
      flow_key: categoryFlowKey,
      flow_file: categoryFlowFile,
      business_type_flow_keys: childFlowKeys,
      update_note: updateNote,
      source_task_ids: categoryTaskIds,
      steps: categorySteps
    });
    categoryFlowIndex[category] = {
      category_flow_key: categoryFlowKey,
      business_type_flow_keys: childFlowKeys
    };
  });

  analysis.category_flows = categoryFlows;
  analysis.business_type_flows = businessTypeFlows;
  analysis.category_flow_index = categoryFlowIndex;
  return written;
}

function cellHeatmapGroup(cell) {
  return cell.heatmap_group || cell.target_heatmap_group || '';
}

function top3BusinessType(item) {
  return item.target_business_type || item.target_business || item.business_type || '';
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

export function buildDrawioMap(analysis, flowsDir, dateKey) {
  const drawioMap = {};

  for (const item of analysis.top3 || []) {
    const key = `top${item.rank}_to_be`;
    const filePath = path.join(flowsDir, `${key}.drawio`);
    if (fs.existsSync(filePath)) {
      drawioMap[key] = fs.readFileSync(filePath, 'utf8');
    }
  }

  if (!fs.existsSync(flowsDir)) return drawioMap;
  for (const name of fs.readdirSync(flowsDir)) {
    if (!name.endsWith('.drawio')) continue;
    if (!name.startsWith('asis_')) continue;
    if (!name.endsWith(`_${dateKey}.drawio`)) continue;
    drawioMap[name.replace(/\.drawio$/, '')] = fs.readFileSync(path.join(flowsDir, name), 'utf8');
  }

  return drawioMap;
}

export function renderHtml({ templatePath, htmlPath, analysis, drawioMap }) {
  const template = fs.readFileSync(templatePath, 'utf8');
  const html = template
    .replace('/* ANALYSIS_DATA_PLACEHOLDER */', JSON.stringify(analysis))
    .replace('/* DRAWIO_XML_MAP_PLACEHOLDER */', JSON.stringify(drawioMap));

  if (html.includes('ANALYSIS_DATA_PLACEHOLDER') || html.includes('DRAWIO_XML_MAP_PLACEHOLDER')) {
    throw new Error('Template placeholders were not fully replaced.');
  }

  fs.writeFileSync(htmlPath, html);
}
