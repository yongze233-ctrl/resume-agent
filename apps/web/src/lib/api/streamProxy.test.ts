import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proxySseResponse } from './streamProxy';

test('a silent upstream sends keep-alive comments, preserves event bytes and stops on cancellation', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let sender: ReadableStreamDefaultController<Uint8Array>;
  let upstreamCancelled = false;
  const upstream = new Response(new ReadableStream<Uint8Array>({
    start(controller) { sender = controller; },
    cancel() { upstreamCancelled = true; },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  const response = proxySseResponse(upstream)!;
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
  assert.equal(response.headers.get('X-Accel-Buffering'), 'no');
  const reader = response.body!.getReader();
  const first = reader.read();
  t.mock.timers.tick(15_000);
  assert.equal(new TextDecoder().decode((await first).value), ': keep-alive\n\n');
  const payload = new TextEncoder().encode('data: {"type":"message_chunk","content":"中文连接成功","streamSequence":1}\n\n');
  sender!.enqueue(payload);
  assert.deepEqual((await reader.read()).value, payload);
  await reader.cancel();
  assert.equal(upstreamCancelled, true);
  assert.doesNotThrow(() => t.mock.timers.tick(30_000));
});

test('ordinary JSON is left to its route handler', () => {
  assert.equal(proxySseResponse(Response.json({ ok: true })), null);
});
