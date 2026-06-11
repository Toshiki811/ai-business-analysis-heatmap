import fs from 'node:fs';
import path from 'node:path';

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
