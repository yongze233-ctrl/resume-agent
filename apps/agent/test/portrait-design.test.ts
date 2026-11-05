import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttachmentContext } from '../src/attachments/context.js';
import type { AgentChatModel } from '../src/model/factory.js';
import { createOpenPencilTools } from '../src/harness/tools/openpencil.js';
import {
  createPencilSession,
  nextCanvasJob,
  resolveCanvasJob,
} from '../src/design/openpencil-session.js';
import { createRunBudget } from '../src/harness/middleware/run-budget.js';
import { captureCustom } from './middleware-helpers.js';

test('attachment-only designs must load and retain the original photo even without a browser portrait hash', async (t) => {
  const source = { info: {}, sections: {} };
  const canvas = createPencilSession(source, '附件照片必须进入最终画板');
  let visualCalls = 0;
  const model = {
    invoke: async () => {
      visualCalls++;
      throw new Error('Must not accept missing photo');
    },
  } as unknown as AgentChatModel;
  const image = {
    id: 'fixture-image',
    mimeType: 'image/png',
    width: 100,
    height: 140,
    dataUrl: 'data:image/png;base64,YWJj',
  };
  const attachments = {
    portrait: async () => ({ status: 'available', image, candidates: [image] }),
  } as unknown as AttachmentContext;
  const tools = createOpenPencilTools(
    async () => source,
    model,
    createRunBudget({ modelCalls: 20, toolCalls: 40 }),
    new AbortController().signal,
    { sessionId: canvas.id, sourceHash: canvas.sourceHash },
    attachments,
  );
  let assetLoads = 0;
  const pump = setInterval(() => {
    const job = nextCanvasJob(canvas);
    if (!job) return;
    if (String(job.args?.code).includes('createImage(')) {
      assetLoads++;
      resolveCanvasJob(canvas, job.id, {
        ok: true,
        result: { ok: true, result: { imageHash: 'b'.repeat(40) } },
      });
    } else
      resolveCanvasJob(canvas, job.id, {
        ok: true,
        result: { ok: true, result: { photoFound: false } },
      });
  }, 5);
  t.after(() => clearInterval(pump));
  const review = tools.find((tool) => tool.name === 'openpencil_review');
  assert.ok(review);
  const { result } = await captureCustom(() =>
    review.invoke({ frameId: 'final' }),
  );
  assert.equal(assetLoads, 1);
  assert.equal(canvas.portraitImageHash, 'b'.repeat(40));
  assert.equal(JSON.parse(String(result)).ready, false);
  assert.match(String(result), /缺少原始照片/);
  assert.equal(visualCalls, 0);
});
