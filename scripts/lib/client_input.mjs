import fs from 'node:fs';
import path from 'node:path';
import { getTaskMatrixAxis } from './schema.mjs';

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

export function ensureCategoryUpdateMap(analysis) {
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

export function categoryUpdateNote(analysis, category) {
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
