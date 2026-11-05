import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.js';

test('a reasoning-only disconnect retries the current round without repeating a completed write', async (t) => {
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'write_file',
          args: {
            file_path: '/scratch/confirmed-step.txt',
            content: 'Confirmed once.',
          },
        },
      ],
    },
    { reasoning: 'Interrupted planning.', disconnect: true },
    { text: 'Recovered answer.' },
  ]);
  const events = await f.chat(f.body({ sessionId: 'reasoning-disconnect' }));
  assert.equal(f.fake.requests.length, 3);
  assert.equal(
    events.filter(
      (e) => e.type === 'tool_started' && e.payload.toolName === 'write_file',
    ).length,
    1,
  );
  assert.equal(events.filter((e) => e.type === 'run_recovery').length, 1);
  assert.ok(
    events.some(
      (e) =>
        e.type === 'message_chunk' && e.content.includes('Recovered answer.'),
    ),
  );
  assert.ok(!events.some((e) => e.type === 'error'));
  assert.ok(
    !JSON.stringify(f.fake.requests[2].messages).includes(
      'Interrupted planning.',
    ),
  );
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('an idle reasoning-only stream retries once; repeated failures stop', async (t) => {
  const f = await fixture(
    t,
    'memory',
    [
      { reasoning: 'Waiting for upstream.', hang: true },
      { reasoning: 'Still unavailable.', hang: true },
      { text: 'This must not run.' },
    ],
    { AGENT_IDLE_TIMEOUT_MS: '150', AGENT_RUN_TIMEOUT_MS: '5000' },
  );
  const events = await f.chat();
  assert.equal(f.fake.requests.length, 2);
  assert.equal(events.filter((e) => e.type === 'run_recovery').length, 1);
  assert.ok(
    events.some(
      (e) => e.type === 'error' && e.payload.subCode === 'model_timeout',
    ),
  );
  assert.ok(!events.some((e) => e.type === 'message_chunk'));
});

test('a partially published answer is preserved and never automatically repeated', async (t) => {
  const f = await fixture(t, 'memory', [
    { text: 'Partial answer.', disconnect: true },
    { text: 'This must not run.' },
  ]);
  const events = await f.chat();
  assert.equal(f.fake.requests.length, 1);
  assert.ok(
    events.some(
      (e) =>
        e.type === 'message_chunk' && e.content.includes('Partial answer.'),
    ),
  );
  assert.ok(events.some((e) => e.type === 'error'));
  assert.ok(!events.some((e) => e.type === 'run_recovery'));
});

test('transient connection failures after a successful step recover without repeating the tool or losing history', async (t) => {
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'write_file',
          args: {
            file_path: '/scratch/confirmed-step.txt',
            content: 'Confirmed once.',
          },
        },
      ],
    },
    { status: 504 },
    { text: '已从已完成步骤继续。' },
  ]);
  const events = await f.chat(
    f.body({ sessionId: 'network-retry-after-write' }),
  );
  assert.equal(f.fake.requests.length, 3);
  assert.equal(
    events.filter(
      (e) => e.type === 'tool_started' && e.payload.toolName === 'write_file',
    ).length,
    1,
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === 'run_recovery' &&
        (e.payload as { reason?: string }).reason === 'connection_retry',
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === 'message_chunk' && e.content.includes('已从已完成步骤继续'),
    ),
  );
  assert.ok(!events.some((e) => e.type === 'error'));
  assert.equal(f.fake.state.invalidHistory, 0);
});
