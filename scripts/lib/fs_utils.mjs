import fs from 'node:fs';
import path from 'node:path';

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function hasText(value) {
  return String(value || '').trim().length > 0;
}

export function resolveDateKey(value) {
  const raw = String(value || '').trim();
  if (/^\d{8}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '');
  throw new Error(`Invalid date. Use YYYYMMDD or YYYY-MM-DD: ${raw || '(empty)'}`);
}

export function dateKeyToIso(dateKey) {
  const key = resolveDateKey(dateKey);
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

export function findLatestAnalysis(root) {
  const outputDir = path.join(root, 'output');
  if (!fs.existsSync(outputDir)) return null;
  const files = fs.readdirSync(outputDir)
    .filter((name) => /^analysis_\d{8}\.json$/.test(name))
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(outputDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (files.length === 0) return null;
  return path.join(outputDir, files[0].name);
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}
