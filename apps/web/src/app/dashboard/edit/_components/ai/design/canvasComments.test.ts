import assert from 'node:assert/strict';
import test from 'node:test';
import { readCanvasComments } from './canvasComments';
import { streamChat } from '../lib/services/agentClient';

test('turn dispatch reads fresh comments, scopes replies to this canvas and never reads in Ask', async (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = globalThis.fetch;
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    value: target,
    configurable: true,
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  let reads = 0;
  target.addEventListener('resume-design:read-comments', (event) => {
    reads++;
    const detail = (event as CustomEvent).detail;
    target.dispatchEvent(
      new CustomEvent('resume-design:comments', {
        detail: {
          ...detail,
          sessionId: 'wrong-canvas',
          comments: { status: 'ready', threads: [] },
        },
      }),
    );
    target.dispatchEvent(
      new CustomEvent('resume-design:comments', {
        detail: {
          ...detail,
          comments: {
            status: 'ready',
            pageId: `page-${reads}`,
            total: 0,
            truncated: false,
            threads: [],
          },
        },
      }),
    );
  });
  const requests: Array<{ designContext?: { comments?: { pageId: string } } }> =
    [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response('data: {"type":"done"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  const params = {
    agentMode: 'cocreate' as const,
    resumeId: 'resume',
    designContext: { sessionId: 'canvas', sourceHash: 'a'.repeat(64) },
    messages: [{ role: 'user' as const, content: '读取评论' }],
  };
  for (let i = 0; i < 2; i++)
    for await (const event of streamChat(params)) {
      assert.equal(event.type, 'done');
    }
  assert.equal(requests[0].designContext?.comments?.pageId, 'page-1');
  assert.equal(requests[1].designContext?.comments?.pageId, 'page-2');
  for await (const event of streamChat({
    ...params,
    agentMode: 'ask',
    designContext: undefined,
  })) {
    assert.equal(event.type, 'done');
  }
  assert.equal(reads, 2);
  assert.equal(requests[2].designContext, undefined);
});

test('pending comment reads can be cancelled and a disconnected canvas is not mistaken for an empty list', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    value: target,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const controller = new AbortController();
  const pending = readCanvasComments('resume', 'canvas', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  target.addEventListener('resume-design:read-comments', (event) => {
    target.dispatchEvent(
      new CustomEvent('resume-design:comments', {
        detail: {
          ...(event as CustomEvent).detail,
          comments: { status: 'unavailable' },
        },
      }),
    );
  });
  assert.deepEqual(await readCanvasComments('resume', 'canvas'), {
    status: 'unavailable',
  });
});
