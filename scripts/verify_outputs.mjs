#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs,
  readJson,
  resolveAnalysisDate,
  resolveAnalysisPath
} from './lib/fs_utils.mjs';
import {
  normalizeAnalysisSchema,
  validateAnalysisContract
} from './lib/render.mjs';
import { checkFlowStructure, checkActorAlignment, buildTaskSubjectIndex } from './lib/flows.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/verify_outputs.mjs --date YYYYMMDD',
    '  node scripts/verify_outputs.mjs --analysis output/analysis_YYYYMMDD.json',
    '  node scripts/verify_outputs.mjs --date YYYYMMDD --analysis output/analysis_YYYYMMDD.json',
    '',
    'Options:',
    '  --skip-html   Validate only the analysis JSON contract'
  ].join('\n');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, message) {
  errors.push(message);
}

function columnMembership(groups) {
  const groupNames = new Set();
  const stepKeys = new Set();
  for (const group of Array.isArray(groups) ? groups : []) {
    const groupName = String(group?.group || group?.name || '').trim();
    if (groupName) groupNames.add(groupName);
    for (const step of Array.isArray(group?.steps) ? group.steps : []) {
      const stepName = String(step || '').trim();
      if (groupName && stepName) stepKeys.add(`${groupName}|||${stepName}`);
    }
  }
  return { groupNames, stepKeys };
}

function categoryAxisMembership(categoryFlowColumns) {
  const map = new Map();
  if (!isObject(categoryFlowColumns)) return map;
  for (const [category, groups] of Object.entries(categoryFlowColumns)) {
    const steps = new Set();
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const step of Array.isArray(group?.steps) ? group.steps : []) {
        const stepName = String(step || '').trim();
        if (stepName) steps.add(stepName);
      }
    }
    map.set(category, steps);
  }
  return map;
}

function taskHeatmapKey(task) {
  return [
    task['業務分類'] || '',
    task['業務種別'] || '',
    task['ヒートマップグループ'] || '',
    task['ヒートマップステップ'] || ''
  ].join('|||');
}

function cellHeatmapKey(cell) {
  return [
    cell.category || '',
    cell.business_type || '',
    cell.heatmap_group || '',
    cell.flow_step || ''
  ].join('|||');
}

function top3HeatmapKey(item) {
  return [
    item.target_category || '',
    item.target_business_type || item.target_business || item.business_type || '',
    item.target_heatmap_group || item.heatmap_group || '',
    item.target_flow_step || ''
  ].join('|||');
}

function verifyAnalysis(analysis, analysisPath) {
  const errors = [];
  const warnings = [];
  const normalized = cloneJson(analysis);
  const stats = normalizeAnalysisSchema(normalized);

  try {
    validateAnalysisContract(normalized);
  } catch (error) {
    addError(errors, error.message);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(normalized.metadata?.created_at || ''))) {
    addError(errors, 'metadata.created_at must be YYYY-MM-DD');
  }

  const { stepKeys: heatmapStepKeys } = columnMembership(normalized.heatmap_columns);
  const categoryAxisMap = categoryAxisMembership(normalized.category_flow_columns);
  const taskKeys = new Set();

  normalized.matrix_tasks.forEach((task, index) => {
    const category = String(task['業務分類'] || '').trim();
    const matrixAxis = String(task['マトリクス横軸'] || '').trim();
    const heatmapGroup = String(task['ヒートマップグループ'] || '').trim();
    const heatmapStep = String(task['ヒートマップステップ'] || '').trim();
    const categoryAxes = categoryAxisMap.get(category);

    if (!categoryAxes) {
      addError(errors, `matrix_tasks[${index}] category_flow_columns missing for category: ${category}`);
    } else if (!categoryAxes.has(matrixAxis)) {
      addError(errors, `matrix_tasks[${index}] マトリクス横軸 not found in category_flow_columns: ${category} / ${matrixAxis}`);
    }

    if (!heatmapStepKeys.has(`${heatmapGroup}|||${heatmapStep}`)) {
      addError(errors, `matrix_tasks[${index}] heatmap axis not found in heatmap_columns: ${heatmapGroup} / ${heatmapStep}`);
    }

    taskKeys.add(taskHeatmapKey(task));
  });

  const cellKeys = new Set();
  normalized.heatmap_cells.forEach((cell, index) => {
    const key = cellHeatmapKey(cell);
    cellKeys.add(key);

    if (!taskKeys.has(key)) {
      addError(errors, `heatmap_cells[${index}] has no matching matrix_tasks axis: ${key}`);
    }

    if (!heatmapStepKeys.has(`${cell.heatmap_group || ''}|||${cell.flow_step || ''}`)) {
      addError(errors, `heatmap_cells[${index}] heatmap axis not found in heatmap_columns: ${cell.heatmap_group || ''} / ${cell.flow_step || ''}`);
    }
  });

  normalized.top3.forEach((item, index) => {
    const key = top3HeatmapKey(item);
    if (!cellKeys.has(key)) {
      addError(errors, `top3[${index}] target does not match any heatmap_cells entry: ${key}`);
    }
  });

  if (stats.matrix_tasks_normalized > 0 || stats.heatmap_cells_normalized > 0 || stats.category_flow_columns_generated || stats.heatmap_columns_generated) {
    warnings.push(`schema normalization would adjust JSON before render: ${JSON.stringify(stats)}`);
  }

  const detailFlows = Array.isArray(normalized.asis_flow_details) ? normalized.asis_flow_details : [];
  if (detailFlows.length > 0) {
    let sourceNodes = 0;
    let linkedNodes = 0;
    for (const flow of detailFlows) {
      for (const node of Array.isArray(flow.nodes) ? flow.nodes : []) {
        if (!node.source_task) continue;
        sourceNodes += 1;
        if (node.task_id) linkedNodes += 1;
      }
    }
    if (sourceNodes > 0 && linkedNodes / sourceNodes < 0.8) {
      warnings.push(`asis_flow_details task link rate is low: ${linkedNodes}/${sourceNodes} nodes resolved to matrix_tasks`);
    }
  }

  // 詳細As-Isフローの欠落業務種別(直列フォールバック描画になり粒度が粗くなる)を警告する
  const businessTypeKeys = new Set();
  normalized.matrix_tasks.forEach((task) => {
    const category = String(task['業務分類'] || '').trim();
    const businessType = String(task['業務種別'] || '').trim();
    if (category && businessType) businessTypeKeys.add(`${category}|||${businessType}`);
  });
  const detailFlowKeys = new Set(detailFlows.map((flow) =>
    `${String(flow.category || '').trim()}|||${String(flow.business_type || '').trim()}`
  ));
  const missingDetailFlows = [...businessTypeKeys].filter((key) => !detailFlowKeys.has(key));
  if (missingDetailFlows.length > 0) {
    warnings.push(`asis_flow_details missing for ${missingDetailFlows.length} business type(s) (rendered as coarse serial flow): ${missingDetailFlows.map((key) => key.replace('|||', ' / ')).join(', ')}`);
  }
  // マトリクスの業務内容詳細の主語(=主作業主体)を source_task キー単位でインデックス化(actorズレ検出に使う)
  const taskSubjectIndex = buildTaskSubjectIndex(normalized.matrix_tasks);
  detailFlows.forEach((flow) => {
    const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : 0;
    if (nodeCount > 0 && nodeCount < 8) {
      warnings.push(`asis_flow_details too coarse: ${flow.category} / ${flow.business_type} has only ${nodeCount} nodes (target 10-25)`);
    }
    // 分岐健全性(decision出口2本以上・2経路以上・condition・差戻し過多)。正本は docs/asis_flow_guideline.md。
    checkFlowStructure(flow, errors, warnings);
    // 主作業主体(actor=スイムレーン)のズレ検出。細分化でノードの担当が本来の主体からズレるのを防ぐ。
    checkActorAlignment(flow, taskSubjectIndex, errors, warnings);
  });

  // 業務種別が1つしかない業務分類(1:1構成)を警告する
  const typesByCategory = new Map();
  businessTypeKeys.forEach((key) => {
    const [category] = key.split('|||');
    typesByCategory.set(category, (typesByCategory.get(category) || 0) + 1);
  });
  typesByCategory.forEach((count, category) => {
    if (count < 2) {
      warnings.push(`category has only ${count} business type (expect 2-5 per category): ${category}`);
    }
  });

  const cellsWithUseCase = normalized.heatmap_cells.filter((cell) => String(cell.ai_use_case || '').trim());
  const templatePhrase = /確認観点(の)?整理|記録作成|根拠資料との照合/;
  const templated = cellsWithUseCase.filter((cell) => templatePhrase.test(String(cell.ai_use_case || ''))).length;
  if (cellsWithUseCase.length > 0 && templated / cellsWithUseCase.length > 0.5) {
    warnings.push(`ai_use_case looks templated on ${templated}/${cellsWithUseCase.length} cells (generic boilerplate phrases); regenerate with input→process→output specifics`);
  }

  return {
    analysisPath,
    errors,
    warnings,
    stats,
    counts: {
      matrix_tasks: normalized.matrix_tasks.length,
      heatmap_cells: normalized.heatmap_cells.length,
      top3: normalized.top3.length,
      categories: Array.isArray(normalized.categories) ? normalized.categories.length : 0
    }
  };
}

function verifyHtml(htmlPath, dateKey, analysis) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(htmlPath)) {
    return {
      htmlPath,
      errors: [`HTML is missing: ${htmlPath}`],
      warnings,
      stats: {}
    };
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  if (html.includes('ANALYSIS_DATA_PLACEHOLDER')) addError(errors, 'HTML still contains ANALYSIS_DATA_PLACEHOLDER');
  if (html.includes('FLOW_SVG_JS_PLACEHOLDER')) addError(errors, 'HTML still contains FLOW_SVG_JS_PLACEHOLDER');

  // フローは自前インラインSVG(flow_svg.js)で描画する。draw.io依存は全廃済みで、残存していたら退行。
  const flowSvgEmbedded = html.includes('global.FlowSvg') || html.includes('FlowSvg=');
  if (!flowSvgEmbedded) addError(errors, 'flow_svg.js (global.FlowSvg) does not appear to be embedded in HTML');
  const drawioRefs = (html.match(/viewer\.diagrams\.net|GraphViewer|DRAWIO_XML_MAP|<mxfile/g) || []).length;
  if (drawioRefs > 0) addError(errors, `HTML still references draw.io (${drawioRefs} occurrence(s)); rendering is now inline SVG`);

  const detailFlows = Array.isArray(analysis?.asis_flow_details) ? analysis.asis_flow_details : [];
  const detailDecisionCount = detailFlows.reduce((count, flow) =>
    count + (Array.isArray(flow.nodes) ? flow.nodes.filter((node) => node.node_type === 'decision').length : 0), 0);
  if (detailDecisionCount > 0 && !html.includes('flow-node-decision')) {
    warnings.push('asis_flow_details contains decision nodes but the flow-node-decision style is not present in HTML');
  }

  return {
    htmlPath,
    errors,
    warnings,
    stats: {
      bytes: html.length,
      flow_svg_embedded: flowSvgEmbedded,
      drawio_refs: drawioRefs,
      detail_decision_nodes: detailDecisionCount
    }
  };
}

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(usage());
  process.exit(0);
}

const analysisPath = resolveAnalysisPath(root, args);

if (!analysisPath) {
  throw new Error(`No analysis JSON found.\n${usage()}`);
}

const analysis = readJson(analysisPath);
const { dateKey } = resolveAnalysisDate(analysisPath, args, analysis);
const htmlPath = path.join(root, 'output', `analysis_${dateKey}.html`);

const analysisResult = verifyAnalysis(analysis, analysisPath);
const htmlResult = args['skip-html'] ? null : verifyHtml(htmlPath, dateKey, analysis);
const allErrors = [
  ...analysisResult.errors,
  ...(htmlResult ? htmlResult.errors : [])
];
const allWarnings = [
  ...analysisResult.warnings,
  ...(htmlResult ? htmlResult.warnings : [])
];

console.log(`Analysis: ${analysisResult.analysisPath}`);
console.log(`Counts: ${JSON.stringify(analysisResult.counts)}`);
if (htmlResult) {
  console.log(`HTML: ${htmlResult.htmlPath}`);
  console.log(`HTML stats: ${JSON.stringify(htmlResult.stats)}`);
}
if (allWarnings.length > 0) {
  console.log('Warnings:');
  allWarnings.forEach((warning) => console.log(`- ${warning}`));
}

if (allErrors.length > 0) {
  console.error('Verification failed:');
  allErrors.slice(0, 80).forEach((error) => console.error(`- ${error}`));
  if (allErrors.length > 80) console.error(`...and ${allErrors.length - 80} more`);
  process.exit(1);
}

console.log('Verification passed.');
