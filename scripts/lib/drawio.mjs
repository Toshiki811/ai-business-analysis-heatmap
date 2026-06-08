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

function actorLane(actor) {
  return LANES.find((lane) => lane.actor === actor) || LANES[0];
}

function asIsActorLane(actor) {
  return AS_IS_LANES.find((lane) => lane.actor === actor) || AS_IS_LANES[0];
}

function compactLine(value, maxLength = 42) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function flowToDrawio(flow, title, now = new Date()) {
  const rows = Array.isArray(flow) ? flow : [];
  const height = Math.max(520, 180 + rows.length * 120);
  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    `<mxCell id="title" value="${escXml(title)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;fontSize=18;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="80" y="30" width="760" height="30" as="geometry" /></mxCell>`
  ];

  LANES.forEach((lane, index) => {
    cells.push(`<mxCell id="lane-${index}" value="${lane.label}" style="swimlane;horizontal=1;startSize=32;html=1;fillColor=${lane.color};strokeColor=${lane.stroke};fontSize=12;fontStyle=1;opacity=80;" vertex="1" parent="1"><mxGeometry x="${lane.x}" y="80" width="250" height="${height}" as="geometry" /></mxCell>`);
  });

  rows.forEach((step, index) => {
    const lane = actorLane(step.actor);
    const y = 130 + index * 120;
    const value = `${step.step || `Step ${index + 1}`}\n${step.actor || 'Human'}\n${step.description || ''}`;
    cells.push(`<mxCell id="process-${index + 1}" value="${escXml(value)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${lane.color};strokeColor=${lane.stroke};fontSize=11;fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="${lane.x + 35}" y="${y}" width="180" height="80" as="geometry" /></mxCell>`);
    if (index > 0) {
      cells.push(`<mxCell id="arrow-${index}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;" edge="1" parent="1" source="process-${index}" target="process-${index + 1}"><mxGeometry relative="1" as="geometry" /></mxCell>`);
    }
  });

  return `<mxfile host="app.diagrams.net" modified="${now.toISOString()}" agent="5.0" version="24.0.0">
  <diagram name="${escXml(title)}" id="${escXml(title).replace(/[^A-Za-z0-9_-]/g, '-')}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1300" pageHeight="${height + 180}" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

export function asIsFlowToDrawio(flow, title, now = new Date()) {
  const rows = Array.isArray(flow) ? flow : [];
  const rowLayouts = rows.map((step) => {
    const hasNote = Boolean(step.resolved_note || step.question);
    return {
      boxHeight: hasNote ? 108 : 78,
      rowGap: hasNote ? 152 : 122
    };
  });
  const height = Math.max(520, 190 + rowLayouts.reduce((sum, row) => sum + row.rowGap, 0));
  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    `<mxCell id="title" value="${escXml(title)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;fontSize=18;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="80" y="30" width="880" height="30" as="geometry" /></mxCell>`
  ];

  AS_IS_LANES.forEach((lane, index) => {
    cells.push(`<mxCell id="asis-lane-${index}" value="${escXml(lane.label)}" style="swimlane;horizontal=1;startSize=32;html=1;fillColor=${lane.color};strokeColor=${lane.stroke};fontSize=12;fontStyle=1;opacity=80;" vertex="1" parent="1"><mxGeometry x="${lane.x}" y="80" width="280" height="${height}" as="geometry" /></mxCell>`);
  });

  let previousProcessId = null;
  let y = 140;
  rows.forEach((step, index) => {
    const lane = asIsActorLane(step.actor);
    const layout = rowLayouts[index];
    if (step.section) {
      cells.push(`<mxCell id="section-${index + 1}" value="${escXml(step.section)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=14;fontStyle=1;fontColor=#1e293b;" vertex="1" parent="1"><mxGeometry x="80" y="${y - 34}" width="860" height="24" as="geometry" /></mxCell>`);
    }

    const processId = step.node_id || `process-${String(index + 1).padStart(3, '0')}`;
    const minutes = step.minutes || step.estimated_minutes || '—';
    const burden = step.burden || '—';
    const commonStep = step.common_step ? `共通: ${step.common_step}` : '';
    const unresolvedQuestion = step.question ? `【要確認】${compactLine(step.question)}` : '';
    const resolvedNote = step.resolved_note ? compactLine(step.resolved_note) : '';
    const value = [
      `${step.task_order || index + 1}. ${step.task_name || step.step || `Step ${index + 1}`}`,
      commonStep,
      `${minutes}分 / 負担: ${burden}`,
      resolvedNote,
      unresolvedQuestion
    ].filter(Boolean).join('\n');
    const strokeWidth = burden === '高' ? 3 : 1;
    const strokeColor = step.question ? '#d97706' : (burden === '高' ? '#dc2626' : lane.stroke);
    const fillColor = step.question ? '#fff2cc' : lane.color;
    cells.push(`<mxCell id="${escXml(processId)}" value="${escXml(value)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=${strokeWidth};fontSize=11;fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="${lane.x + 38}" y="${y}" width="205" height="${layout.boxHeight}" as="geometry" /></mxCell>`);

    if (previousProcessId) {
      cells.push(`<mxCell id="arrow-${index}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#666666;strokeWidth=2;endArrow=block;endFill=1;" edge="1" parent="1" source="${escXml(previousProcessId)}" target="${escXml(processId)}"><mxGeometry relative="1" as="geometry" /></mxCell>`);
    }
    previousProcessId = processId;
    y += layout.rowGap;
  });

  return `<mxfile host="app.diagrams.net" modified="${now.toISOString()}" agent="5.0" version="24.0.0">
  <diagram name="${escXml(title)}" id="${escXml(title).replace(/[^A-Za-z0-9_-]/g, '-')}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1040" pageHeight="${height + 180}" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}
