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
  buildDrawioMap,
  applyLatestClientInput,
  ensureHeatmapToBeTasks,
  normalizeAnalysisSchema,
  renderHtml,
  resolveQuestions,
  validateAnalysisContract,
  writeAsIsDrawio,
  writeTop3Drawio
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
const flowsDir = path.join(root, 'output', 'flows');
const htmlPath = path.join(root, 'output', `analysis_${dateKey}.html`);

const schemaStats = normalizeAnalysisSchema(analysis);
const clientInputStats = applyLatestClientInput(analysis, root);
const resolved = resolveQuestions(analysis);
const writtenAsIsDrawio = writeAsIsDrawio(analysis, flowsDir, dateKey);
const writtenDrawio = writeTop3Drawio(analysis, flowsDir);
const generatedToBeTasks = ensureHeatmapToBeTasks(analysis);
validateAnalysisContract(analysis);
writeJson(analysisPath, analysis);
const drawioMap = buildDrawioMap(analysis, flowsDir, dateKey);
renderHtml({ templatePath, htmlPath, analysis, drawioMap });

console.log(`Analysis: ${analysisPath}`);
console.log(`Schema normalized: ${JSON.stringify(schemaStats)}`);
if (clientInputStats.file) {
  console.log(`Client input applied: ${clientInputStats.file} (${clientInputStats.applied}/${clientInputStats.rows} rows)`);
}
console.log(`Resolved questions: ${resolved.length}`);
console.log(`As-Is draw.io files written: ${writtenAsIsDrawio.length}`);
console.log(`Top3 draw.io files written: ${writtenDrawio.length}`);
console.log(`To-Be task tables generated: ${generatedToBeTasks}`);
console.log(`Draw.io entries embedded: ${Object.keys(drawioMap).length}`);
console.log(`HTML: ${htmlPath}`);
