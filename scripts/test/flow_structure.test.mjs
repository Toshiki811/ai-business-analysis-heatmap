import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFlowStructure } from '../lib/flows.mjs';

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
