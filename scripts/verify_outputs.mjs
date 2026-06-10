#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  findLatestAnalysis,
  parseArgs,
  readJson,
  resolveDateKey
} from './lib/fs_utils.mjs';
import {
  normalizeAnalysisSchema,
  validateAnalysisContract
} from './lib/render.mjs';

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

function verifyHtml(htmlPath, dateKey) {
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
  if (html.includes('DRAWIO_XML_MAP_PLACEHOLDER')) addError(errors, 'HTML still contains DRAWIO_XML_MAP_PLACEHOLDER');

  const drawioEmbedded = (html.match(/<mxfile/g) || []).length;
  const topToBeEmbedded = (html.match(/top[123]_to_be/g) || []).length;
  const asIsEmbedded = (html.match(new RegExp(`asis_[^"']+_${dateKey}`, 'g')) || []).length;

  if (drawioEmbedded === 0) addError(errors, 'No draw.io XML appears to be embedded in HTML');
  if (topToBeEmbedded < 3) addError(errors, 'TOP3 To-Be draw.io entries are not all embedded');
  if (asIsEmbedded === 0) addError(errors, 'No date-matched As-Is draw.io entries appear to be embedded');
  if (!html.includes('viewer.diagrams.net')) warnings.push('viewer.diagrams.net reference was not found; draw.io preview may not work');

  return {
    htmlPath,
    errors,
    warnings,
    stats: {
      bytes: html.length,
      drawio_embedded: drawioEmbedded,
      top_to_be_key_mentions: topToBeEmbedded,
      as_is_key_mentions: asIsEmbedded
    }
  };
}

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(usage());
  process.exit(0);
}

const analysisPath = args.analysis
  ? path.resolve(root, args.analysis)
  : (args.date
    ? path.join(root, 'output', `analysis_${resolveDateKey(args.date)}.json`)
    : findLatestAnalysis(root));

if (!analysisPath) {
  throw new Error(`No analysis JSON found.\n${usage()}`);
}

const analysis = readJson(analysisPath);
const dateKey = args.date
  ? resolveDateKey(args.date)
  : resolveDateKey(analysis.metadata?.created_at || path.basename(analysisPath).match(/analysis_(\d{8})\.json$/)?.[1]);
const htmlPath = path.join(root, 'output', `analysis_${dateKey}.html`);

const analysisResult = verifyAnalysis(analysis, analysisPath);
const htmlResult = args['skip-html'] ? null : verifyHtml(htmlPath, dateKey);
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
