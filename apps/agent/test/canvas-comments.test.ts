import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasCommentsSchema } from '../src/design/canvas-comments.js';
import { parseChatRequest } from '../src/contracts/requests.js';
import {
  createPencilSession,
  getPencilSession,
  nextCanvasJob,
  resolveCanvasJob,
} from '../src/design/openpencil-session.js';
import { fixture, resume } from './helpers.js';

const comments = {
  status: 'ready' as const,
  pageId: 'page-1',
  total: 1,
  truncated: false,
  threads: [
    {
      id: 'comment-1',
      text: '项目经历区增加留白',
      author: 'User',
      resolved: false,
      pageId: 'page-1',
      nodeId: 'frame-1',
      nodeName: 'Resume',
      position: { x: 80, y: 210 },
      nearbyText: [{ id: 'text-1', text: '项目经历' }],
      replies: [{ id: 'reply-1', text: '保留正文内容', author: 'User' }],
    },
  ],
};

test('the first model call receives current native comments and later turns replace them', async (t) => {
  const f = await fixture(t, 'memory', [
    { text: '已读到评论。' },
    { text: '当前没有评论。' },
    { text: '普通问答。' },
  ]);
  const canvas = createPencilSession(resume, '评论读取验证');
  const designContext = {
    sessionId: canvas.id,
    sourceHash: canvas.sourceHash,
    comments,
  };
  await f.chat(
    f.body({
      sessionId: 'comment-context',
      designContext,
      messages: [{ role: 'user', content: '读一下画布评论' }],
    }),
  );
  const first = JSON.stringify(f.fake.requests[0].messages);
  assert.ok(first.includes(comments.threads[0].text));
  assert.ok(first.includes('text-1'));
  assert.ok(first.includes('保留正文内容'));
  await f.chat(
    f.body({
      sessionId: 'comment-context',
      designContext: {
        ...designContext,
        comments: { ...comments, total: 0, threads: [] },
      },
      messages: [{ role: 'user', content: '再读一次当前评论' }],
    }),
  );
  assert.ok(
    !JSON.stringify(
      f.fake.requests[1].messages.filter(
        (message) => message.role === 'system',
      ),
    ).includes(comments.threads[0].text),
  );
  const parsed = parseChatRequest(f.body({ agentMode: 'ask', designContext }));
  assert.equal(parsed.designContext, undefined);
  await f.chat(f.body({ agentMode: 'ask', designContext }));
  assert.ok(
    !JSON.stringify(f.fake.requests.at(-1)?.messages).includes(
      comments.threads[0].text,
    ),
  );
  assert.equal(
    nextCanvasJob(canvas),
    null,
    'reading a comment does not silently edit the document',
  );
});

test('inspect returns live comments intact even for a long canvas', async (t) => {
  const f = await fixture(t, 'memory', [
    { calls: [{ name: 'openpencil_inspect', args: {} }] },
    { text: '已读取图层和评论。' },
  ]);
  const canvas = createPencilSession(resume, '当前评论与图层');
  const inspection = {
    rootId: 'frame-1',
    comments,
    nodes: Array.from({ length: 500 }, (_, i) => ({
      id: `text-${i}`,
      type: 'TEXT',
      text: '原始文字'.repeat(40),
    })),
  };
  const worker = setInterval(() => {
    const active = getPencilSession(canvas.id);
    const job = active && nextCanvasJob(active);
    if (job && active)
      resolveCanvasJob(active, job.id, { ok: true, result: inspection });
  }, 5);
  t.after(() => clearInterval(worker));
  await f.chat(
    f.body({
      designContext: { sessionId: canvas.id, sourceHash: canvas.sourceHash },
    }),
  );
  const tool = f.fake.requests
    .flatMap((request) => request.messages)
    .find((message) => message.role === 'tool');
  assert.ok(tool && typeof tool.content === 'string');
  const output = JSON.parse(tool.content);
  assert.deepEqual(output.comments, comments);
  assert.ok(Array.isArray(output.nodes));
  assert.equal(output.nodesTruncated, true);
  assert.equal(output.nodeCount, 500);
  assert.ok(tool.content.length <= 60000);
});

test('comment contract rejects invalid bounds and excessive payloads', () => {
  assert.equal(canvasCommentsSchema.safeParse(comments).success, true);
  assert.equal(
    canvasCommentsSchema.safeParse({
      ...comments,
      threads: Array(31).fill(comments.threads[0]),
    }).success,
    false,
  );
  assert.equal(
    canvasCommentsSchema.safeParse({
      ...comments,
      threads: [{ ...comments.threads[0], position: { x: Infinity, y: 1 } }],
    }).success,
    false,
  );
});
