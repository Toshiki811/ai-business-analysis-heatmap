#!/usr/bin/env node
import path from 'node:path';
import {
  parseArgs,
  readJson,
  resolveAnalysisDate,
  resolveAnalysisPath,
  writeJson
} from './lib/fs_utils.mjs';
import {
  applyLatestClientInput,
  buildAsIsFlowIndex,
  ensureHeatmapToBeTasks,
  fileDetailFlowQuestions,
  mergeAsIsFlowDetails,
  normalizeAnalysisSchema,
  renderHtml,
  resolveQuestions,
  stripTop3DrawioArtifacts,
  validateAnalysisContract
} from './lib/render.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/render_outputs.mjs --date YYYYMMDD',
    '  node scripts/render_outputs.mjs --analysis output/analysis_YYYYMMDD.json',
    '  node scripts/render_outputs.mjs --date YYYYMMDD --analysis output/analysis_YYYYMMDD.json'
  ].join('\n');
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
const { dateKey, createdAt } = resolveAnalysisDate(analysisPath, args, analysis);
analysis.metadata = { ...(analysis.metadata || {}), created_at: createdAt };

const templatePath = path.join(root, 'templates', 'heatmap_template.html');
const htmlPath = path.join(root, 'output', `analysis_${dateKey}.html`);

const schemaStats = normalizeAnalysisSchema(analysis);
const clientInputStats = applyLatestClientInput(analysis, root);
const detailStats = mergeAsIsFlowDetails(analysis, root, dateKey);
const filedQuestions = fileDetailFlowQuestions(analysis);
const resolved = resolveQuestions(analysis);
const flowIndexStats = buildAsIsFlowIndex(analysis, dateKey);
stripTop3DrawioArtifacts(analysis);
const generatedToBeTasks = ensureHeatmapToBeTasks(analysis);
validateAnalysisContract(analysis);
writeJson(analysisPath, analysis);
renderHtml({ templatePath, htmlPath, analysis });

console.log(`Analysis: ${analysisPath}`);
console.log(`Schema normalized: ${JSON.stringify(schemaStats)}`);
if (clientInputStats.file) {
  console.log(`Client input applied: ${clientInputStats.file} (${clientInputStats.applied}/${clientInputStats.rows} rows)`);
}
if (detailStats.flows > 0) {
  console.log(`As-Is detail flows: ${detailStats.flows} business type(s) (linked nodes ${detailStats.linked_nodes}/${detailStats.source_task_nodes})`);
  console.log(`Detail-flow hearing items filed: ${filedQuestions}`);
}
console.log(`Resolved questions: ${resolved.length}`);
console.log(`As-Is flow index: ${flowIndexStats.categories} categor(ies) / ${flowIndexStats.business_types} business type(s)`);
console.log(`To-Be task tables generated: ${generatedToBeTasks}`);
console.log(`HTML: ${htmlPath}`);
