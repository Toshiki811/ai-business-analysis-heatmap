export function getTaskMinutes(task) {
  return task['1件あたり所要時間_分_ヒアリング後'] || task['所要時間_分'] || task['1件あたり所要時間_分'] || task.estimated_minutes || '';
}

export function getTaskMatrixAxis(task) {
  return task['マトリクス横軸'] || task.matrix_axis || task['共通ステップ'] || task.common_step || task['タスク名'] || '';
}

export function getTaskHeatmapStep(task) {
  return task['ヒートマップステップ'] || task.heatmap_step || task['共通ステップ'] || task.common_step || getTaskMatrixAxis(task);
}

export function normalizeColumnGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      group: String(group?.group || group?.name || '').trim(),
      steps: (Array.isArray(group?.steps) ? group.steps : [])
        .map((step) => String(step || '').trim())
        .filter(Boolean)
    }))
    .filter((group) => group.group || group.steps.length > 0);
}

function columnStepGroupMap(groups) {
  const map = new Map();
  for (const group of normalizeColumnGroups(groups)) {
    for (const step of group.steps) {
      if (!map.has(step)) map.set(step, group.group);
    }
  }
  return map;
}

export function inferHeatmapGroup(analysis, step) {
  const normalizedStep = String(step || '').trim();
  if (!normalizedStep) return '';
  const fromHeatmap = columnStepGroupMap(analysis.heatmap_columns).get(normalizedStep);
  if (fromHeatmap) return fromHeatmap;
  const fromFlow = columnStepGroupMap(analysis.flow_columns).get(normalizedStep);
  return fromFlow || '';
}

function deriveHeatmapColumns(analysis) {
  const baseColumns = normalizeColumnGroups(analysis.heatmap_columns || analysis.flow_columns);
  if (baseColumns.length > 0) return baseColumns;

  const groupMap = new Map();
  for (const cell of analysis.heatmap_cells || []) {
    const step = String(cell.flow_step || '').trim();
    if (!step) continue;
    const group = String(cell.heatmap_group || 'AI導入効果').trim();
    if (!groupMap.has(group)) groupMap.set(group, []);
    const steps = groupMap.get(group);
    if (!steps.includes(step)) steps.push(step);
  }

  return [...groupMap.entries()].map(([group, steps]) => ({ group, steps }));
}

function deriveCategoryFlowColumns(analysis) {
  const categoryMap = new Map();
  for (const task of analysis.matrix_tasks || []) {
    const category = String(task['業務分類'] || task.category || '未分類').trim();
    const group = String(task['ヒートマップグループ'] || task.heatmap_group || '業務ステップ').trim();
    const matrixAxis = String(getTaskMatrixAxis(task) || '').trim();
    if (!matrixAxis) continue;
    if (!categoryMap.has(category)) categoryMap.set(category, new Map());
    const groupMap = categoryMap.get(category);
    if (!groupMap.has(group)) groupMap.set(group, []);
    const steps = groupMap.get(group);
    if (!steps.includes(matrixAxis)) steps.push(matrixAxis);
  }

  return Object.fromEntries([...categoryMap.entries()].map(([category, groupMap]) => [
    category,
    [...groupMap.entries()].map(([group, steps]) => ({ group, steps }))
  ]));
}

function normalizeEffectLevel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === '高' || text === 'high') return 'high';
  if (text === '中' || text === 'medium') return 'medium';
  if (text === '低' || text === 'low') return 'low';
  return text || 'low';
}


export function top3BusinessType(item) {
  return item.target_business_type || item.target_business || item.business_type || '';
}

export function normalizeAnalysisSchema(analysis) {
  const stats = {
    matrix_tasks_normalized: 0,
    heatmap_cells_normalized: 0,
    category_flow_columns_generated: false,
    heatmap_columns_generated: false
  };

  analysis.matrix_tasks = Array.isArray(analysis.matrix_tasks) ? analysis.matrix_tasks : [];
  analysis.heatmap_cells = Array.isArray(analysis.heatmap_cells) ? analysis.heatmap_cells : [];
  analysis.top3 = Array.isArray(analysis.top3) ? analysis.top3 : [];

  const heatmapColumns = deriveHeatmapColumns(analysis);
  if (!Array.isArray(analysis.heatmap_columns) || analysis.heatmap_columns.length === 0) {
    analysis.heatmap_columns = heatmapColumns;
    stats.heatmap_columns_generated = true;
  } else {
    analysis.heatmap_columns = normalizeColumnGroups(analysis.heatmap_columns);
  }
  if (!Array.isArray(analysis.flow_columns) || analysis.flow_columns.length === 0) {
    analysis.flow_columns = analysis.heatmap_columns;
  } else {
    analysis.flow_columns = normalizeColumnGroups(analysis.flow_columns);
  }

  for (const task of analysis.matrix_tasks) {
    const before = [
      task['マトリクス横軸'],
      task['ヒートマップグループ'],
      task['ヒートマップステップ']
    ].join('|');
    const matrixAxis = String(getTaskMatrixAxis(task) || '').trim();
    const heatmapStep = String(getTaskHeatmapStep(task) || matrixAxis).trim();
    const heatmapGroup = String(task['ヒートマップグループ'] || task.heatmap_group || inferHeatmapGroup(analysis, heatmapStep)).trim();
    task['マトリクス横軸'] = matrixAxis;
    task['ヒートマップグループ'] = heatmapGroup;
    task['ヒートマップステップ'] = heatmapStep;
    const after = [
      task['マトリクス横軸'],
      task['ヒートマップグループ'],
      task['ヒートマップステップ']
    ].join('|');
    if (before !== after) stats.matrix_tasks_normalized += 1;
  }

  for (const cell of analysis.heatmap_cells) {
    const before = [cell.heatmap_group, cell.effect_level].join('|');
    cell.category = cell.category || cell['業務分類'] || '';
    cell.business_type = cell.business_type || cell['業務種別'] || '';
    cell.flow_step = cell.flow_step || cell['ヒートマップステップ'] || cell.common_step || '';
    cell.heatmap_group = cell.heatmap_group || inferHeatmapGroup(analysis, cell.flow_step);
    cell.effect_level = normalizeEffectLevel(cell.effect_level);
    const after = [cell.heatmap_group, cell.effect_level].join('|');
    if (before !== after) stats.heatmap_cells_normalized += 1;
  }

  for (const item of analysis.top3) {
    item.target_business_type = top3BusinessType(item);
    item.target_heatmap_group = item.target_heatmap_group || inferHeatmapGroup(analysis, item.target_flow_step);
  }

  if (!Array.isArray(analysis.categories) || analysis.categories.length === 0) {
    analysis.categories = [...new Set(analysis.matrix_tasks.map((task) => task['業務分類']).filter(Boolean))];
  }

  if (!analysis.category_flow_columns || Object.keys(analysis.category_flow_columns).length === 0) {
    analysis.category_flow_columns = deriveCategoryFlowColumns(analysis);
    stats.category_flow_columns_generated = true;
  }

  analysis.metadata = {
    ...(analysis.metadata || {}),
    schema_version: new Date().toISOString().slice(0, 10),
    schema_normalized_at: analysis.metadata?.created_at || ''
  };

  return stats;
}

export function validateAnalysisContract(analysis) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(analysis.matrix_tasks) || analysis.matrix_tasks.length === 0) errors.push('matrix_tasks is missing or empty');
  if (!Array.isArray(analysis.heatmap_cells) || analysis.heatmap_cells.length === 0) errors.push('heatmap_cells is missing or empty');
  if (!Array.isArray(analysis.top3) || analysis.top3.length === 0) errors.push('top3 is missing or empty');
  else if (analysis.top3.length !== 3) warnings.push(`top3 has ${analysis.top3.length} item(s); expected 3`);
  if (!analysis.category_flow_columns || Object.keys(analysis.category_flow_columns).length === 0) errors.push('category_flow_columns is missing');
  if (!Array.isArray(analysis.heatmap_columns) || analysis.heatmap_columns.length === 0) errors.push('heatmap_columns is missing or empty');

  (analysis.matrix_tasks || []).forEach((task, index) => {
    for (const key of ['業務分類', '業務種別', 'タスク名', 'マトリクス横軸', 'ヒートマップグループ', 'ヒートマップステップ']) {
      if (!String(task[key] || '').trim()) errors.push(`matrix_tasks[${index}] missing ${key}`);
    }
  });

  (analysis.heatmap_cells || []).forEach((cell, index) => {
    for (const key of ['category', 'business_type', 'heatmap_group', 'flow_step', 'reason', 'effect_level']) {
      if (!String(cell[key] || '').trim()) errors.push(`heatmap_cells[${index}] missing ${key}`);
    }
    if (!['high', 'medium', 'low', '高', '中', '低'].includes(String(cell.effect_level || '').trim())) {
      errors.push(`heatmap_cells[${index}] invalid effect_level: ${cell.effect_level}`);
    }
  });

  (analysis.top3 || []).forEach((item, index) => {
    for (const key of ['rank', 'title', 'target_category', 'target_business_type', 'target_heatmap_group', 'target_flow_step']) {
      if (!String(item[key] || '').trim()) errors.push(`top3[${index}] missing ${key}`);
    }
    if (!Array.isArray(item.to_be_flow) || item.to_be_flow.length === 0) {
      errors.push(`top3[${index}] missing to_be_flow`);
    }
  });

  if (warnings.length > 0) {
    console.warn(`[validation warnings]\n${warnings.join('\n')}`);
  }
  if (errors.length > 0) {
    throw new Error(`Analysis contract validation failed:\n${errors.slice(0, 40).join('\n')}${errors.length > 40 ? `\n...and ${errors.length - 40} more` : ''}`);
  }

  return true;
}
