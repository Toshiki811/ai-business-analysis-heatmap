#!/usr/bin/env node
import path from 'node:path';
import {
  dateKeyToIso,
  findLatestAnalysis,
  parseArgs,
  readJson,
  resolveDateKey,
  writeJson
} from './lib/fs_utils.mjs';
import {
  buildDrawioMap,
  renderHtml,
  resolveQuestions,
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
const createdAt = args.date ? dateKeyToIso(dateKey) : (analysis.metadata?.created_at || dateKeyToIso(dateKey));
analysis.metadata = { ...(analysis.metadata || {}), created_at: createdAt };

const templatePath = path.join(root, 'templates', 'heatmap_template.html');
const flowsDir = path.join(root, 'output', 'flows');
const htmlPath = path.join(root, 'output', `analysis_${dateKey}.html`);

const resolved = resolveQuestions(analysis);
const writtenAsIsDrawio = writeAsIsDrawio(analysis, flowsDir, dateKey);
writeJson(analysisPath, analysis);
const writtenDrawio = writeTop3Drawio(analysis, flowsDir);
const drawioMap = buildDrawioMap(analysis, flowsDir, dateKey);
renderHtml({ templatePath, htmlPath, analysis, drawioMap });

console.log(`Analysis: ${analysisPath}`);
console.log(`Resolved questions: ${resolved.length}`);
console.log(`As-Is draw.io files written: ${writtenAsIsDrawio.length}`);
console.log(`Top3 draw.io files written: ${writtenDrawio.length}`);
console.log(`Draw.io entries embedded: ${Object.keys(drawioMap).length}`);
console.log(`HTML: ${htmlPath}`);
