import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRequestError } from './agentClient';
import { streamWhenSessionReady } from './sessionHandoff';
import type { AgentSseEvent } from './types';

const busy = () => new AgentRequestError({ errorCode: 'conflict', subCode: 'session_busy', source: 'bff', retryable: false });
async function collect(stream: AsyncGenerator<AgentSseEvent>) {
  const events = [];
  for await (const event of stream) events.push(event.type);
  return events;
}

test('an interrupted session waits for admission before starting its next run', async () => {
  let calls = 0;
  const make = async function* (): AsyncGenerator<AgentSseEvent> {
    if (++calls < 3) throw busy();
    yield { type: 'run_started' }; yield { type: 'done' };
  };
  assert.deepEqual(await collect(streamWhenSessionReady(make, new AbortController().signal, 1000)), ['run_started', 'done']);
  assert.equal(calls, 3);
});

test('a stream that already produced an event is never replayed', async () => {
  let calls = 0;
  const make = async function* (): AsyncGenerator<AgentSseEvent> { calls++; yield { type: 'run_started' }; throw busy(); };
  await assert.rejects(collect(streamWhenSessionReady(make, new AbortController().signal, 1000)), AgentRequestError);
  assert.equal(calls, 1);
});

test('other conflicts and ordinary sends do not enter the handoff retry loop', async () => {
  for (const subCode of ['session_busy', 'session_awaiting_input']) {
    let calls = 0;
    const make = async function* (): AsyncGenerator<AgentSseEvent> { calls++; throw new AgentRequestError({ errorCode: 'conflict', subCode, source: 'bff', retryable: false }); };
    await assert.rejects(collect(streamWhenSessionReady(make, new AbortController().signal, subCode === 'session_busy' ? 0 : 1000)), AgentRequestError);
    assert.equal(calls, 1);
  }
});

test('stopping during handoff cancels the wait without another request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const make = async function* (): AsyncGenerator<AgentSseEvent> { calls++; queueMicrotask(() => controller.abort()); throw busy(); };
  await assert.rejects(collect(streamWhenSessionReady(make, controller.signal, 1000)), { name: 'AbortError' });
  assert.equal(calls, 1);
});
