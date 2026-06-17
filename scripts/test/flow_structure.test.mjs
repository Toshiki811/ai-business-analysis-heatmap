import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFlowStructure,
  checkActorAlignment,
  buildTaskSubjectIndex,
  sourceTaskKey,
  subjectFromDetail
} from '../lib/flows.mjs';

function decision(branches, extra = {}) {
  return { id: 'd1', node_type: 'decision', condition: '金額が基準額を超えるか', branches, ...extra };
}

test('checkFlowStructure: 2枝2経路+condition+ラベルあり = error/warningなし', () => {
  const flow = {
    category: 'C', business_type: 'B',
    nodes: [decision([{ label: '超過', target: 'n02' }, { label: '以下', target: 'n03' }])]
  };
  const { errors, warnings } = checkFlowStructure(flow);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

test('checkFlowStructure: 1本枝decision = error(出口2本未満)', () => {
  const flow = { category: 'C', business_type: 'B', nodes: [decision([{ label: '超過', target: 'n02' }])] };
  const { errors } = checkFlowStructure(flow);
  assert.ok(errors.some((e) => /has 1 branch/.test(e)));
});

test('checkFlowStructure: 偽分岐(全枝が同一target) = error(経路1)', () => {
  const flow = {
    category: 'C', business_type: 'B',
    nodes: [decision([{ label: '超過', target: 'n02' }, { label: '以下', target: 'n02' }])]
  };
  const { errors } = checkFlowStructure(flow);
  assert.ok(errors.some((e) => /distinct target/.test(e)));
});

test('checkFlowStructure: condition欠落 = error / ラベル空 = warning', () => {
  const flow = {
    category: 'C', business_type: 'B',
    nodes: [decision([{ label: '', target: 'n02' }, { label: '以下', target: 'n03' }], { condition: '' })]
  };
  const { errors, warnings } = checkFlowStructure(flow);
  assert.ok(errors.some((e) => /missing condition/.test(e)));
  assert.ok(warnings.some((w) => /unlabeled branch/.test(w)));
});

test('checkFlowStructure: 非decisionが複数経路に分岐 = warning(菱形にし忘れ)', () => {
  const flow = {
    category: 'C', business_type: 'B',
    nodes: [{ id: 'p1', node_type: 'process', branches: [{ label: 'a', target: 'n02' }, { label: 'b', target: 'n03' }] }]
  };
  const { warnings } = checkFlowStructure(flow);
  assert.ok(warnings.some((w) => /forks to 2 targets but is not a decision/.test(w)));
});

test('checkFlowStructure: 例外ノードの単一routing枝は対象外(warningなし)', () => {
  const flow = {
    category: 'C', business_type: 'B',
    nodes: [{ id: 'e1', node_type: 'exception', branches: [{ label: '修正後', target: 'n05', edge_type: 'return' }] }]
  };
  const { errors, warnings } = checkFlowStructure(flow);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

test('checkFlowStructure: 差戻し過多 = soft warning', () => {
  const flow = {
    category: 'C', business_type: 'B',
    nodes: [
      decision([{ label: '可', target: 'n09' }, { label: '差戻し1', target: 'n01', edge_type: 'return' }]),
      { id: 'e1', node_type: 'exception', branches: [{ label: '差戻し2', target: 'n02', edge_type: 'return' }] }
    ]
  };
  const { warnings } = checkFlowStructure(flow);
  assert.ok(warnings.some((w) => /scattered rework gates/.test(w)));
});

// --- checkActorAlignment(主作業主体ズレ検出) ---

test('subjectFromDetail: 業務内容詳細の冒頭主語を抽出', () => {
  assert.equal(subjectFromDetail('会計責任者が出納職員を監督し、確認する。'), '会計責任者');
  assert.equal(subjectFromDetail('理事長が会計責任者を任命する。'), '理事長');
  assert.equal(subjectFromDetail(''), '');
  // 先頭が条件節のときは実主語を取る
  assert.equal(subjectFromDetail('残高差異がある場合に出納職員が原因を調査する。'), '出納職員');
});

const SRC = { 業務分類: 'C', 業務種別: 'B', タスク順: 2, タスク名: '請求書確認' };
const MATRIX = [{ ...SRC, 業務内容詳細: '出納職員が請求書と納品書を照合する。' }];

test('checkActorAlignment: 主体が全ノードに残っていれば warning なし', () => {
  const flow = {
    category: 'C', business_type: 'B', actors: ['出納職員'],
    nodes: [
      { id: 'n1', node_type: 'process', actor: '出納職員', source_task: SRC },
      { id: 'n2', node_type: 'process', actor: '出納職員', source_task: SRC }
    ]
  };
  const { warnings } = checkActorAlignment(flow, buildTaskSubjectIndex(MATRIX));
  assert.equal(warnings.length, 0);
});

test('checkActorAlignment: タスクから主作業主体が消えると warning(分解ズレ)', () => {
  const flow = {
    category: 'C', business_type: 'B', actors: ['会計責任者'],
    nodes: [
      { id: 'n1', node_type: 'process', actor: '会計責任者', source_task: SRC },
      { id: 'n2', node_type: 'process', actor: '会計責任者', source_task: SRC }
    ]
  };
  const { warnings } = checkActorAlignment(flow, buildTaskSubjectIndex(MATRIX));
  assert.ok(warnings.some((w) => /lost its main actor "出納職員"/.test(w)));
});

test('checkActorAlignment: 宣言したactorに1ノードも無いと error(空スイムレーン)', () => {
  const flow = {
    category: 'C', business_type: 'B', actors: ['出納職員', '会計システム'],
    nodes: [
      { id: 'n1', node_type: 'process', actor: '出納職員', source_task: SRC },
      { id: 'n2', node_type: 'process', actor: '出納職員', source_task: SRC }
    ]
  };
  const { errors } = checkActorAlignment(flow, buildTaskSubjectIndex(MATRIX));
  assert.ok(errors.some((e) => /declared actor "会計システム" but no node/.test(e)));
});

test('checkActorAlignment: 全宣言actorにノードがあれば空レーンerrorなし', () => {
  const flow = {
    category: 'C', business_type: 'B', actors: ['出納職員', '会計システム'],
    nodes: [
      { id: 'n1', node_type: 'process', actor: '出納職員', source_task: SRC },
      { id: 'n2', node_type: 'process', actor: '会計システム', source_task: SRC }
    ]
  };
  const { errors } = checkActorAlignment(flow, buildTaskSubjectIndex(MATRIX));
  assert.equal(errors.length, 0);
});

test('checkActorAlignment: actor が actors[] に無いと warning(孤立レーン)', () => {
  const flow = {
    category: 'C', business_type: 'B', actors: ['出納職員'],
    nodes: [{ id: 'n1', node_type: 'process', actor: '経理課長', source_task: SRC }]
  };
  const { warnings } = checkActorAlignment(flow, buildTaskSubjectIndex(MATRIX));
  assert.ok(warnings.some((w) => /not declared in actors\[\]/.test(w)));
});

test('checkActorAlignment: 表記ゆれ(出納職員⊃出納)は同一主体として許容', () => {
  const matrix = [{ ...SRC, 業務内容詳細: '出納が記帳する。' }];
  const flow = {
    category: 'C', business_type: 'B', actors: ['出納職員'],
    nodes: [{ id: 'n1', node_type: 'process', actor: '出納職員', source_task: SRC }]
  };
  const { warnings } = checkActorAlignment(flow, buildTaskSubjectIndex(matrix));
  assert.equal(warnings.length, 0);
});

test('sourceTaskKey: 4項目から一意キー', () => {
  assert.equal(sourceTaskKey(SRC), 'C|||B|||2|||請求書確認');
  assert.equal(sourceTaskKey(null), '');
});
