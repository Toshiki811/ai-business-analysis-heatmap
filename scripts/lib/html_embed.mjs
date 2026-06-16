import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const flowSvgPath = path.join(here, '..', '..', 'templates', 'app', 'js', 'flow_svg.js');

export function renderHtml({ templatePath, htmlPath, analysis }) {
  const template = fs.readFileSync(templatePath, 'utf8');
  const flowSvgJs = fs.readFileSync(flowSvgPath, 'utf8');

  // 置換値に $ が含まれても壊れないよう関数リプレーサを使う($&/$1等の特殊解釈を回避)
  const html = template
    .replace('/* ANALYSIS_DATA_PLACEHOLDER */', () => JSON.stringify(analysis))
    .replace('/* FLOW_SVG_JS_PLACEHOLDER */', () => flowSvgJs);

  if (html.includes('ANALYSIS_DATA_PLACEHOLDER') || html.includes('FLOW_SVG_JS_PLACEHOLDER')) {
    throw new Error('Template placeholders were not fully replaced.');
  }

  fs.writeFileSync(htmlPath, html);
}
