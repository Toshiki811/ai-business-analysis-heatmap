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
  if (!answer) return;
  const { impact, note } = asIsResolvedNote(resolved.question, answer);
  task.as_is_answer_impact = impact;
  task.as_is_resolved_note = note;
  task.as_is_resolved_question = resolved.question || '';
  task.as_is_resolved_answer = answer;
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
    if (!answer) continue;
    const item = {
      category: task['業務分類'] || '',
      task_type: task['業務種別'] || '',
      task_name: task['タスク名'] || '',
      question: task['確認事項'] || '',
      answer: task['クライアント回答'] || '',
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
    fs.writeFileSync(asIsPath, flowToDrawio(item.as_is_flow, `Top${rank} As-Is: ${item.title || ''}`));
    fs.writeFileSync(toBePath, flowToDrawio(item.to_be_flow, `Top${rank} To-Be: ${item.title || ''}`));
    written.push(asIsPath, toBePath);
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
  return task['所要時間_分'] || task['1件あたり所要時間_分'] || task.estimated_minutes || '';
}

function inferAsIsActor(task) {
  const text = [
    task['タスク名'],
    task['業務内容詳細'],
    task['現状課題'],
    task['クライアント回答'],
    task.as_is_resolved_answer
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
    common_step: task['共通ステップ'] || '',
    task_name: task['タスク名'] || '',
    actor: inferAsIsActor(task),
    description: task['業務内容詳細'] || '',
    issue: task['現状課題'] || '',
    question: task['確認事項'] || '',
    resolved_note: task.as_is_resolved_note || '',
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
          task['共通ステップ'] || '',
          task['タスク名'] || ''
        ].join('|');
        task.task_id = task.task_id || hashId(taskIdSource);
        const nodeId = `process-${String(nodeIndex).padStart(3, '0')}`;
        task.as_is_category_flow_key = categoryFlowKey;
        task.as_is_node_id = nodeId;
        task.as_is_position_label = `${category} > ${businessType} > ${task['タスク順'] || rowIndex + 1}. ${task['タスク名'] || ''}${task['共通ステップ'] ? ` / ${task['共通ステップ']}` : ''}`;
        categorySteps.push(buildAsIsStep(task, rowIndex === 0 ? section : '', nodeId));
        categoryTaskIds.push(task.task_id);
        nodeIndex += 1;
      });
    });

    const categoryPath = path.join(flowsDir, `${categoryFlowKey}.drawio`);
    fs.writeFileSync(categoryPath, asIsFlowToDrawio(categorySteps, `As-Is 全体: ${category}`));
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
      fs.writeFileSync(businessPath, asIsFlowToDrawio(businessSteps, `As-Is 部分: ${category} / ${businessType}`));
      written.push(businessPath);
      childFlowKeys.push(businessFlowKey);
      businessTypeFlows.push({
        category,
        business_type: businessType,
        flow_key: businessFlowKey,
        flow_file: businessFlowFile,
        category_flow_key: categoryFlowKey,
        source_task_ids: rows.map((task) => task.task_id),
        steps: businessSteps
      });
    });

    categoryFlows.push({
      category,
      flow_key: categoryFlowKey,
      flow_file: categoryFlowFile,
      business_type_flow_keys: childFlowKeys,
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

export function buildDrawioMap(analysis, flowsDir, dateKey) {
  const drawioMap = {};

  for (const item of analysis.top3 || []) {
    for (const suffix of ['as_is', 'to_be']) {
      const key = `top${item.rank}_${suffix}`;
      const filePath = path.join(flowsDir, `${key}.drawio`);
      if (fs.existsSync(filePath)) {
        drawioMap[key] = fs.readFileSync(filePath, 'utf8');
      }
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
