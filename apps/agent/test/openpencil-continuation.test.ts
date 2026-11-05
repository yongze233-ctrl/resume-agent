import assert from 'node:assert/strict';
import test from 'node:test';
import { createPencilSession, getPencilSession, nextCanvasJob, resolveCanvasJob, resumePencilSession } from '../src/design/openpencil-session.js';
import { parseChatRequest } from '../src/contracts/requests.js';
import { fixture, resume } from './helpers.js';

test('a later chat turn reconnects to the same canvas, including after its in-memory session expires', async (t) => {
  const readSkill = { calls: [{ name: 'read_file', args: { file_path: '/skills/resume-design/SKILL.md' } }] };
  const inspect = { calls: [{ name: 'openpencil_inspect', args: { frameId: 'frame-1' } }] };
  // A missing progress label must not discard valid, potentially large edit code.
  const edit = { calls: [{ name: 'openpencil_edit', args: { code: 'return { frameId: "frame-1" };' } }] };
  const f = await fixture(t, 'memory', [readSkill, inspect, edit, { text: 'First edit completed.' }, readSkill, inspect, edit, { text: 'Continued on the same canvas.' }]);
  const original = structuredClone(resume);
  const canvas = createPencilSession(resume, '继续编辑同一张简历画布');
  const context = { sessionId: canvas.id, sourceHash: canvas.sourceHash, frameId: 'frame-1' };
  const executed: string[] = [];
  const worker = setInterval(() => {
    const active = getPencilSession(context.sessionId);
    if (!active) return;
    const job = nextCanvasJob(active);
    if (!job) return;
    executed.push(`${active.id}:${job.operation}`);
    resolveCanvasJob(active, job.id, { ok: true, result: job.operation === 'inspect'
      ? { rootId: 'frame-1', nodes: [{ id: 'frame-1', type: 'FRAME' }] }
      : { ok: true, result: { frameId: 'frame-1' } } });
  }, 5);
  t.after(() => clearInterval(worker));
  for (const content of ['在画布上设计简历', '继续']) {
    const events = await f.chat(f.body({ sessionId: 'continue-design', designContext: context, messages: [{ role: 'user', content }] }));
    assert.ok(!events.some((event) => event.type === 'error'));
    const widgets = events.filter((event) => event.type === 'ui_widget');
    assert.ok(widgets.some((event) => event.type === 'ui_widget' && event.payload.props && typeof event.payload.props === 'object' && 'sessionId' in event.payload.props && event.payload.props.sessionId === canvas.id));
    if (content !== '继续') canvas.createdAt = Date.now() - 3_600_001;
  }
  assert.deepEqual(executed.map((entry) => entry.slice(canvas.id.length + 1)), ['inspect', 'call', 'inspect', 'call']);
  assert.ok(getPencilSession(context.sessionId)?.steps.some(step => step.title === '调整简历排版' && step.status === 'completed'));
  assert.deepEqual(resume, original);
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('canvas context cannot attach changed resume facts and is discarded in Ask mode', () => {
  const canvas = createPencilSession(resume, '当前简历');
  const context = { sessionId: canvas.id, sourceHash: canvas.sourceHash };
  assert.throws(() => resumePencilSession({ ...resume, info: { ...resume.info, fullName: 'Other' } }, context), /design_source_changed/);
  const parsed = parseChatRequest({ messages: [{ role: 'user', content: 'Explain a layout.' }], agentMode: 'ask', designContext: context, currentResume: resume, config: { apiKey: 'example-test-key', baseUrl: 'https://model.example.com/v1', modelName: 'example-model' } });
  assert.equal(parsed.designContext, undefined);
  assert.equal(parsed.currentResume, undefined);
});
