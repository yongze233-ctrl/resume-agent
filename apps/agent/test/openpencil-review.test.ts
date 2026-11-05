import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage } from '@langchain/core/messages';
import { createOpenPencilTools, pencilFacts, requiredPencilText } from '../src/harness/tools/openpencil.js';
import { createPencilSession, nextCanvasJob, resolveCanvasJob } from '../src/design/openpencil-session.js';
import { createRunBudget } from '../src/harness/middleware/run-budget.js';
import type { AgentChatModel } from '../src/model/factory.js';
import { captureCustom, runModel, modelRequest } from './middleware-helpers.js';
import { resume } from './helpers.js';

test('a canvas made from chat attachments does not claim zero source facts passed validation', async (t) => {
  const empty = { info: {}, sections: [] };
  const canvas = createPencilSession(empty, '只有聊天附件，没有结构化文档');
  const model = { invoke: async () => new AIMessage(JSON.stringify({ summary: '版式清楚。', needsAdjustment: false })) } as unknown as AgentChatModel;
  const tools = createOpenPencilTools(async () => empty, model, createRunBudget({ modelCalls: 20, toolCalls: 40 }), new AbortController().signal, { sessionId: canvas.id, sourceHash: canvas.sourceHash });
  const pump = setInterval(() => {
    const job = nextCanvasJob(canvas); if (!job) return;
    resolveCanvasJob(canvas, job.id, { ok: true, result: { pdf: 'example-pdf-bytes', fig: 'example-native-fig', pdfText: '附件中提取的内容', image: { result: { base64: 'example-image-data' } }, pages: [{ width: 595.28, height: 841.89 }], inspection: { width: 595.28, height: 841.89, nodes: [] } } });
  }, 5);
  t.after(() => clearInterval(pump));
  const review = tools.find(x => x.name === 'openpencil_review'); assert.ok(review);
  const { result } = await captureCustom(() => review.invoke({ frameId: 'one' }));
  const value = JSON.parse(String(result));
  assert.equal(value.ready, true);
  assert.equal(value.contentVerified, false);
  assert.match(value.review, /尚未自动核对/);
  assert.ok(canvas.steps.every(step => !step.detail.includes('原文 0 项覆盖通过')));
});

test('repeated visual critiques preserve the draft and end the repair loop without claiming approval', async (t) => {
  const original = structuredClone(resume);
  const canvas = createPencilSession(resume, '旧占位稿的设计方向');
  let reviews = 0;
  const model = { invoke: async () => { reviews++; return new AIMessage(JSON.stringify({ summary: '正文局部重叠，需要人工调整。', needsAdjustment: true })); } } as unknown as AgentChatModel;
  const budget = createRunBudget({ modelCalls: 20, toolCalls: 40 });
  const tools = createOpenPencilTools(async () => resume, model, budget, new AbortController().signal, { sessionId: canvas.id, sourceHash: canvas.sourceHash });
  const review = tools.find((entry) => entry.name === 'openpencil_review');
  assert.ok(review);
  let exports = 0;
  const worker = setInterval(() => {
    const job = nextCanvasJob(canvas);
    if (!job) return;
    exports++;
    resolveCanvasJob(canvas, job.id, { ok: true, result: { pdf: 'example-pdf-bytes', fig: 'example-native-fig-bytes', pdfText: requiredPencilText(pencilFacts(resume)).join('\n'), image: { result: { base64: 'example-image-data' } }, pages: [{ width: 595.28, height: 841.89 }], fonts: { fallback: [] }, inspection: { width: 595.28, height: 841.89, nodes: [] } } });
  }, 5);
  t.after(() => clearInterval(worker));
  for (let pass = 0; pass < 3; pass++) {
    const { result } = await captureCustom(() => review.invoke({ frameId: 'frame-1' }));
    const value = JSON.parse(String(result));
    assert.equal(value.ready, false);
    if (pass > 0) assert.equal(value.needsUserReview, true);
  }
  assert.equal(reviews, 2);
  assert.equal(exports, 2);
  assert.equal(canvas.status, 'failed');
  assert.ok(canvas.bundle);
  assert.deepEqual(resume, original);
  await runModel(budget.middleware(), modelRequest({ tools: [{ name: 'openpencil_edit' }] }), async (request?: unknown) => {
    assert.deepEqual((request as { tools: unknown[] }).tools, []);
    return new AIMessage('草稿已保留，审阅尚未通过。');
  });
});

test('review rejects a missing original portrait before invoking the visual model', async (t) => {
  const canvas = createPencilSession(resume, '必须保留原始照片');
  canvas.portraitImageHash = 'a'.repeat(40);
  let modelCalls = 0;
  const model = { invoke: async () => { modelCalls++; throw new Error('Should not run'); } } as unknown as AgentChatModel;
  const tools = createOpenPencilTools(async () => resume, model, createRunBudget({ modelCalls: 20, toolCalls: 40 }), new AbortController().signal, { sessionId: canvas.id, sourceHash: canvas.sourceHash });
  const pump = setInterval(() => { const job = nextCanvasJob(canvas); if (job) resolveCanvasJob(canvas, job.id, { ok: true, result: { ok: true, result: { photoFound: false } } }); }, 5);
  t.after(() => clearInterval(pump));
  const { result } = await captureCustom(() => tools.find(x => x.name === 'openpencil_review')!.invoke({ frameId: 'one' }));
  assert.equal(JSON.parse(String(result)).ready, false);
  assert.match(JSON.parse(String(result)).error, /照片/);
  assert.equal(modelCalls, 0);
});

test('multi-page designs are refused before export without truncating or changing existing frames', async () => {
  const canvas = createPencilSession(resume, '两页可读的完整原文');
  let imageCount = 0;
  const model = { invoke: async (messages: Array<{ content: Array<{ type: string }> }>) => { imageCount = messages[0].content.filter(x => x.type === 'image_url').length; return new AIMessage(JSON.stringify({ summary: '两页排版清楚。', needsAdjustment: false })); } } as unknown as AgentChatModel;
  const tools = createOpenPencilTools(async () => resume, model, createRunBudget({ modelCalls: 20, toolCalls: 40 }), new AbortController().signal, { sessionId: canvas.id, sourceHash: canvas.sourceHash });
  canvas.frameIds = ['old-one', 'old-two'];
  const { result } = await captureCustom(() => tools.find(x => x.name === 'openpencil_review')!.invoke({ frameId: 'one', frameIds: ['one', 'two'] }));
  assert.equal(JSON.parse(String(result)).ready, false);
  assert.equal(JSON.parse(String(result)).pageLimit, 1);
  assert.equal(imageCount, 0);
  assert.equal(nextCanvasJob(canvas), null);
  assert.deepEqual(canvas.frameIds, ['old-one', 'old-two']);
});

test('exporting only page one cannot pass if source content from later pages is missing', async (t) => {
  const canvas = createPencilSession(resume, '保留完整原文的一页排版');
  let modelCalls = 0;
  const model = { invoke: async () => { modelCalls++; throw new Error('Must not review incomplete content'); } } as unknown as AgentChatModel;
  const tools = createOpenPencilTools(async () => resume, model, createRunBudget({ modelCalls: 20, toolCalls: 40 }), new AbortController().signal, { sessionId: canvas.id, sourceHash: canvas.sourceHash });
  const pump = setInterval(() => { const job = nextCanvasJob(canvas); if (job) resolveCanvasJob(canvas, job.id, { ok: true, result: { pdf: 'example-pdf-bytes', fig: 'example-native-fig', pdfText: resume.info.fullName, image: { result: { base64: 'example-image-data' } }, pages: [{ width: 595.28, height: 841.89 }], inspection: { width: 595.28, height: 841.89, nodes: [] } } }); }, 5);
  t.after(() => clearInterval(pump));
  const { result } = await captureCustom(() => tools.find(x => x.name === 'openpencil_review')!.invoke({ frameId: 'one' }));
  assert.equal(JSON.parse(String(result)).ready, false);
  assert.match(JSON.parse(String(result)).error, /缺少/);
  assert.equal(modelCalls, 0);
});
