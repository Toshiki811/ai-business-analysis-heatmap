import { escXml } from './escape.mjs';

const LANES = [
  { actor: 'Human', x: 80, color: '#dae8fc', stroke: '#6c8ebf', label: 'Human' },
  { actor: 'AI', x: 370, color: '#e1d5e7', stroke: '#9673a6', label: 'AI' },
  { actor: 'Human Review', x: 660, color: '#fff2cc', stroke: '#d6b656', label: 'Human Review' },
  { actor: 'System', x: 950, color: '#f5f5f5', stroke: '#666666', label: 'System' }
];

const AS_IS_LANES = [
  { actor: '担当者・業務部門', x: 80, color: '#dae8fc', stroke: '#6c8ebf', label: '担当者・業務部門' },
  { actor: '上長・管理者・承認者', x: 390, color: '#e1d5e7', stroke: '#9673a6', label: '上長・管理者・承認者' },
  { actor: 'システム', x: 700, color: '#f5f5f5', stroke: '#666666', label: 'システム' }
];

function compactLine(value, maxLength = 42) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function stepBaseId(step, index) {
  return step.id || step.node_id || `process-${index + 1}`;
}

function isDecision(step) {
  return step.node_type === 'decision' || Boolean(step.condition && Array.isArray(step.branches));
}

function resolveTarget(target, idByStepId) {
  if (!target) return '';
  const raw = String(target);
  return idByStepId.get(raw) || raw;
}

function edgeCell(id, source, target, label = '') {
  return `<mxCell id="${escXml(id)}" value="${escXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;fontSize=11;fontColor=#1f2937;" edge="1" parent="1" source="${escXml(source)}" target="${escXml(target)}"><mxGeometry relative="1" as="geometry" /></mxCell>`;
}

function renderFlowToDrawio({
  flow,
  title,
  now,
  lanes,
  lanePrefix,
  pageWidth,
  titleWidth,
  startY,
  rowGap,
  actorLaneForStep,
  valueForStep,
  processSize,
  decisionSize
}) {
  const rows = Array.isArray(flow) ? flow : [];
  const height = Math.max(520, 180 + rows.length * rowGap);
  const idByStepId = new Map();
  rows.forEach((step, index) => {
    const cellId = stepBaseId(step, index);
    idByStepId.set(String(cellId), cellId);
    if (step.id) idByStepId.set(String(step.id), cellId);
    if (step.node_id) idByStepId.set(String(step.node_id), cellId);
  });

  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    `<mxCell id="title" value="${escXml(title)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;fontSize=18;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="80" y="30" width="${titleWidth}" height="30" as="geometry" /></mxCell>`
  ];

  lanes.forEach((lane, index) => {
    cells.push(`<mxCell id="${lanePrefix}-${index}" value="${escXml(lane.label)}" style="swimlane;horizontal=1;startSize=32;html=1;fillColor=${lane.color};strokeColor=${lane.stroke};fontSize=12;fontStyle=1;opacity=80;" vertex="1" parent="1"><mxGeometry x="${lane.x}" y="80" width="${lane.width}" height="${height}" as="geometry" /></mxCell>`);
  });

  rows.forEach((step, index) => {
    const lane = actorLaneForStep(step);
    const y = startY + index * rowGap;
    const cellId = stepBaseId(step, index);
    const decision = isDecision(step);
    const size = decision ? decisionSize : processSize;
    const x = lane.x + Math.round((lane.width - size.width) / 2);
    const value = valueForStep(step, index, decision);
    const shapeStyle = decision
      ? 'rhombus;whiteSpace=wrap;html=1;'
      : 'rounded=1;whiteSpace=wrap;html=1;';
    const fillColor = decision ? '#fff2cc' : (step.fillColor || lane.color);
    const strokeColor = decision ? '#d6b656' : (step.strokeColor || lane.stroke);
    const strokeWidth = step.strokeWidth || 1;
    cells.push(`<mxCell id="${escXml(cellId)}" value="${escXml(value)}" style="${shapeStyle}fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=${strokeWidth};fontSize=11;fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${size.width}" height="${size.height}" as="geometry" /></mxCell>`);
  });

  rows.forEach((step, index) => {
    const sourceId = stepBaseId(step, index);
    const branches = Array.isArray(step.branches) ? step.branches : [];
    if (branches.length > 0) {
      branches.forEach((branch, branchIndex) => {
        const targetId = resolveTarget(branch.target, idByStepId);
        if (!targetId) return;
        cells.push(edgeCell(`edge-${index + 1}-${branchIndex + 1}`, sourceId, targetId, branch.label || ''));
      });
      if (!step.next) return;
    }
    const nextTarget = step.next
      ? resolveTarget(step.next, idByStepId)
      : (rows[index + 1] ? stepBaseId(rows[index + 1], index + 1) : '');
    if (nextTarget) cells.push(edgeCell(`edge-${index + 1}`, sourceId, nextTarget));
  });

  return `<mxfile host="app.diagrams.net" modified="${now.toISOString()}" agent="5.0" version="24.0.0">
  <diagram name="${escXml(title)}" id="${escXml(title).replace(/[^A-Za-z0-9_-]/g, '-')}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${height + 180}" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

export function flowToDrawio(flow, title, now = new Date()) {
  const lanes = LANES.map((lane) => ({ ...lane, width: 250 }));
  return renderFlowToDrawio({
    flow,
    title,
    now,
    lanes,
    lanePrefix: 'lane',
    pageWidth: 1300,
    titleWidth: 760,
    startY: 130,
    rowGap: 130,
    actorLaneForStep: (step) => lanes.find((lane) => lane.actor === step.actor) || lanes[0],
    valueForStep: (step, index, decision) => {
      if (decision) {
        return [
          step.step || `Decision ${index + 1}`,
          step.condition || step.description || ''
        ].filter(Boolean).join('\n');
      }
      return `${step.step || `Step ${index + 1}`}\n${step.actor || 'Human'}\n${step.description || ''}`;
    },
    processSize: { width: 180, height: 80 },
    decisionSize: { width: 170, height: 100 }
  });
}

export function asIsFlowToDrawio(flow, title, categoryUpdateNote = '', now = new Date()) {
  const rows = Array.isArray(flow) ? flow : [];
  const rowLayouts = rows.map((step) => {
    const noteCount = [step.resolved_note, step.question].filter(Boolean).length;
    const hasNote = noteCount > 0;
    return {
      boxHeight: isDecision(step) ? 104 + Math.max(0, noteCount - 1) * 20 : (hasNote ? 108 + Math.max(0, noteCount - 1) * 18 : 78),
      rowGap: hasNote || isDecision(step) ? 152 : 122
    };
  });
  const maxRowGap = Math.max(...rowLayouts.map((row) => row.rowGap), 122);
  const processHeight = Math.max(...rowLayouts.map((row) => row.boxHeight), 86);
  const lanes = AS_IS_LANES.map((lane) => ({ ...lane, width: 280 }));
  const rowsWithStyle = rows.map((step) => {
    const burden = step.burden || '—';
    return {
      ...step,
      strokeWidth: burden === '高' ? 3 : 1,
      strokeColor: step.question ? '#d97706' : (burden === '高' ? '#dc2626' : undefined),
      fillColor: step.question ? '#fff2cc' : undefined
    };
  });
  const sectionCells = [];
  const categoryNote = String(categoryUpdateNote || '').replace(/\s+/g, ' ').trim();
  const startY = categoryNote ? 210 : 140;
  if (categoryNote) {
    sectionCells.push(`<mxCell id="category-update-note" value="${escXml(`業務分類更新メモ\n${compactLine(categoryNote, 120)}`)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0284c7;fontSize=12;fontColor=#0f172a;align=left;verticalAlign=top;spacing=8;" vertex="1" parent="1"><mxGeometry x="80" y="66" width="860" height="58" as="geometry" /></mxCell>`);
  }
  let y = startY;
  rows.forEach((step, index) => {
    if (step.section) {
      sectionCells.push(`<mxCell id="section-${index + 1}" value="${escXml(step.section)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=14;fontStyle=1;fontColor=#1e293b;" vertex="1" parent="1"><mxGeometry x="80" y="${y - 34}" width="860" height="24" as="geometry" /></mxCell>`);
    }
    y += maxRowGap;
  });

  const xml = renderFlowToDrawio({
    flow: rowsWithStyle,
    title,
    now,
    lanes,
    lanePrefix: 'asis-lane',
    pageWidth: 1040,
    titleWidth: 880,
    startY,
    rowGap: maxRowGap,
    actorLaneForStep: (step) => lanes.find((lane) => lane.actor === step.actor) || lanes[0],
    valueForStep: (step, index, decision) => {
      const minutes = step.minutes || step.estimated_minutes || '—';
      const burden = step.burden || '—';
      const commonStep = step.common_step ? `共通: ${step.common_step}` : '';
      const unresolvedQuestion = step.question ? `【要確認】${compactLine(step.question)}` : '';
      const resolvedNote = step.resolved_note ? compactLine(step.resolved_note) : '';
      const label = `${step.task_order || index + 1}. ${step.task_name || step.step || `Step ${index + 1}`}`;
      if (decision) {
        return [
          step.condition || label,
          commonStep,
          resolvedNote,
          unresolvedQuestion
        ].filter(Boolean).join('\n');
      }
      return [
        label,
        commonStep,
        `${minutes}分 / 負担: ${burden}`,
        resolvedNote,
        unresolvedQuestion
      ].filter(Boolean).join('\n');
    },
    processSize: { width: 205, height: processHeight },
    decisionSize: { width: 185, height: 110 }
  });

  return xml.replace('<mxCell id="1" parent="0" />', `<mxCell id="1" parent="0" />\n        ${sectionCells.join('\n        ')}`);
}
