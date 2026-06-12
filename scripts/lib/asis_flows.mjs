import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureDir, readJson } from './fs_utils.mjs';
import { asIsFlowToDrawio, detailAsIsFlowToDrawio } from './drawio.mjs';
import { categoryUpdateNote, fallbackMatrixTaskKey, matrixTaskKey } from './client_input.mjs';
import { getTaskHeatmapStep, getTaskMatrixAxis, getTaskMinutes } from './schema.mjs';
import { suppressNonFlowQuestions } from './questions.mjs';

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

function inferAsIsActor(task) {
  const taskName = String(task['タスク名'] || '');
  // 明示的な更新メモ・確定回答がある場合のみ詳細テキストを参照
  const explicitText = [task.as_is_update_note, task['As-Isフロー更新内容'], task.as_is_resolved_answer]
    .filter(Boolean).join(' ');

  // タスク名が承認・決裁主体のケース → 上長レーン
  if (/^承認|^決裁|承認依頼|承認・決裁|上長確認|上長レビュー|差戻/.test(taskName)) {
    return '上長・管理者・承認者';
  }
  if (/承認|決裁|上長|管理者|確認者|レビュー|差戻|再承認/.test(explicitText)) {
    return '上長・管理者・承認者';
  }

  // タスク名がシステム主体の自動処理ケース → システムレーン
  if (/自動取込|自動連携|自動処理|システム自動|自動計算|自動生成/.test(taskName)) {
    return 'システム';
  }
  if (/システム|連携|自動/.test(explicitText)) {
    return 'システム';
  }

  // デフォルト → 担当者レーン
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

function detailFlowKey(category, businessType) {
  return `${String(category || '').trim()}|||${String(businessType || '').trim()}`;
}

function sourceTaskKeys(node) {
  const source = node?.source_task;
  if (!source || typeof source !== 'object') return { full: '', fallback: '' };
  const full = matrixTaskKey({
    '業務分類': source['業務分類'],
    '業務種別': source['業務種別'],
    'タスク順': source['タスク順'],
    'マトリクス横軸': source['マトリクス横軸'] || '',
    'タスク名': source['タスク名']
  });
  const fallback = fallbackMatrixTaskKey({
    '業務分類': source['業務分類'],
    '業務種別': source['業務種別'],
    'タスク名': source['タスク名']
  });
  return { full, fallback };
}

function resolveDetailTaskLinks(flow, tasks) {
  const byFullKey = new Map();
  const byFallbackKey = new Map();
  const byOrderKey = new Map();
  for (const task of tasks) {
    byFullKey.set(matrixTaskKey(task), task);
    const fallbackKey = fallbackMatrixTaskKey(task);
    if (!byFallbackKey.has(fallbackKey)) byFallbackKey.set(fallbackKey, task);
    const orderKey = [task['業務分類'], task['業務種別'], task['タスク順']]
      .map((value) => String(value || '').trim()).join('|||');
    if (!byOrderKey.has(orderKey)) byOrderKey.set(orderKey, task);
  }

  let linked = 0;
  let total = 0;
  for (const node of flow.nodes || []) {
    if (!node.source_task) continue;
    total += 1;
    const { full, fallback } = sourceTaskKeys(node);
    const orderKey = [
      node.source_task['業務分類'],
      node.source_task['業務種別'],
      node.source_task['タスク順']
    ].map((value) => String(value || '').trim()).join('|||');
    const task = byFullKey.get(full) || byFallbackKey.get(fallback) || byOrderKey.get(orderKey);
    if (!task) continue;
    linked += 1;
    if (task.task_id) node.task_id = task.task_id;
    node.matrix_axis = node.matrix_axis || getTaskMatrixAxis(task);
    node.heatmap_group = node.heatmap_group || task['ヒートマップグループ'] || '';
    node.heatmap_step = node.heatmap_step || getTaskHeatmapStep(task);
    if (!node.minutes) node.minutes = getTaskMinutes(task);
    if (!node.burden) node.burden = task['人手の負担'] || '';
    if (task.as_is_resolved_note && !node.resolved_note) node.resolved_note = task.as_is_resolved_note;
  }
  return { linked, total };
}

export function loadAsIsFlowDetails(root, dateKey) {
  const filePath = path.join(root, 'output', `asis_flows_${dateKey}.json`);
  if (!fs.existsSync(filePath)) return { filePath: '', flows: [] };
  const data = readJson(filePath);
  const flows = Array.isArray(data?.flows) ? data.flows : [];
  return { filePath, flows };
}

export function mergeAsIsFlowDetails(analysis, root, dateKey) {
  const { filePath, flows } = loadAsIsFlowDetails(root, dateKey);
  if (flows.length > 0) {
    analysis.asis_flow_details = flows;
    analysis.metadata = {
      ...(analysis.metadata || {}),
      asis_flow_details_source: path.basename(filePath)
    };
  } else if (!Array.isArray(analysis.asis_flow_details)) {
    analysis.asis_flow_details = [];
  }

  const tasks = Array.isArray(analysis.matrix_tasks) ? analysis.matrix_tasks : [];
  let linked = 0;
  let total = 0;
  for (const flow of analysis.asis_flow_details) {
    const stats = resolveDetailTaskLinks(flow, tasks);
    linked += stats.linked;
    total += stats.total;
  }
  return {
    file: filePath,
    flows: analysis.asis_flow_details.length,
    linked_nodes: linked,
    source_task_nodes: total
  };
}

function detailFlowMap(analysis) {
  const map = new Map();
  for (const flow of Array.isArray(analysis.asis_flow_details) ? analysis.asis_flow_details : []) {
    map.set(detailFlowKey(flow.category, flow.business_type), flow);
  }
  return map;
}

export function writeAsIsDrawio(analysis, flowsDir, dateKey) {
  ensureDir(flowsDir);
  suppressNonFlowQuestions(analysis);
  const tasks = Array.isArray(analysis.matrix_tasks) ? analysis.matrix_tasks : [];
  const categoryMap = groupMatrixTasks(tasks);
  const detailFlows = detailFlowMap(analysis);
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
      const detailFlow = detailFlows.get(detailFlowKey(category, businessType));
      const businessPath = path.join(flowsDir, `${businessFlowKey}.drawio`);
      const title = `As-Is 部分: ${category} / ${businessType}`;
      if (detailFlow && Array.isArray(detailFlow.nodes) && detailFlow.nodes.length > 0) {
        // task_id 付与後に再リンクしてから詳細フローを描画する
        resolveDetailTaskLinks(detailFlow, rows);
        detailFlow.flow_key = businessFlowKey;
        detailFlow.flow_file = businessFlowFile;
        fs.writeFileSync(businessPath, detailAsIsFlowToDrawio(detailFlow, title, updateNote));
      } else {
        fs.writeFileSync(businessPath, asIsFlowToDrawio(businessSteps, title, updateNote));
      }
      written.push(businessPath);
      childFlowKeys.push(businessFlowKey);
      businessTypeFlows.push({
        category,
        business_type: businessType,
        flow_key: businessFlowKey,
        flow_file: businessFlowFile,
        category_flow_key: categoryFlowKey,
        category_update_note: updateNote,
        detail: Boolean(detailFlow && Array.isArray(detailFlow.nodes) && detailFlow.nodes.length > 0),
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
