import assert from 'node:assert/strict';
import test from 'node:test';
import { createPencilSession, nextCanvasJob, requestCanvas, resolveCanvasJob, getPencilSession } from '../src/design/openpencil-session.js';
import { pencilFacts, requiredPencilText } from '../src/harness/tools/openpencil.js';

test('canvas jobs are scoped, resolve once, and abort without stale work', async () => {
  const first = createPencilSession({ info: { fullName: '甲' }, sections: {} }, '设计甲');
  const second = createPencilSession({ info: { fullName: '乙' }, sections: {} }, '设计乙');
  const control = new AbortController();
  const waiting = requestCanvas(first, { operation: 'inspect' }, control.signal);
  const job = nextCanvasJob(first);
  assert.ok(job);
  assert.equal(nextCanvasJob(second), null);
  assert.equal(resolveCanvasJob(second, job.id, { ok: true, result: 'wrong' }), false);
  assert.equal(resolveCanvasJob(first, job.id, { ok: true, result: { nodes: ['first'] } }), true);
  assert.deepEqual(await waiting, { nodes: ['first'] });
  assert.equal(resolveCanvasJob(first, job.id, { ok: true, result: 'duplicate' }), false);
  const cancelled = requestCanvas(first, { operation: 'call', command: 'eval' }, control.signal);
  control.abort();
  await assert.rejects(cancelled, /停止/);
  assert.equal(nextCanvasJob(first), null);
  first.createdAt = Date.now() - 3_600_001;
  assert.equal(getPencilSession(first.id), undefined);
});

test('design source retains actual text, filters hidden records, and never changes resume facts', () => {
  const resume = { info: { fullName: '林知行' }, sections: { projects: [
    { id: 'one', visible: true, name: '会员项目', summary: '<p>参与3场 &amp; 协助执行；没有销售数据。</p>' },
    { id: 'two', visible: false, name: '隐藏项目' },
  ] } };
  const original = structuredClone(resume);
  const facts = pencilFacts(resume);
  const required = requiredPencilText(facts);
  assert.ok(required.includes('参与3场 & 协助执行；没有销售数据。'));
  assert.ok(required.includes('会员项目'));
  assert.ok(!required.includes('隐藏项目'));
  assert.ok(!required.includes('one'));
  assert.deepEqual(resume, original);
});

test('content gate checks every original paragraph while excluding import-only custom field labels', () => {
  const facts = pencilFacts({ info: { customFields: [{ id: 'a', name: '人工导入标签', value: '真实标语' }] }, sections: { projects: [{ name: '原项目', summary: '<p>第一段：3 家模型。</p><p>第二段：396 项测试。</p>' }] } });
  const required = requiredPencilText(facts);
  assert.ok(required.includes('真实标语'));
  assert.ok(!required.includes('人工导入标签'));
  assert.ok(required.includes('第一段：3 家模型。'));
  assert.ok(required.includes('第二段：396 项测试。'));
});
