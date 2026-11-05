import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.js';

test('the actual graph continues after an empty response without repeating a successful tool write', async (t) => {
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'write_file',
          args: {
            file_path: '/scratch/completed-step.txt',
            content: 'Written once.',
          },
        },
      ],
    },
    { text: '' },
    { text: '已继续并完成剩余步骤。' },
  ]);
  const events = await f.chat(f.body({ sessionId: 'empty-continue-once' }));
  assert.equal(f.fake.requests.length, 3);
  assert.equal(
    events.filter(
      (event) =>
        event.type === 'tool_started' &&
        event.payload.toolName === 'write_file',
    ).length,
    1,
  );
  assert.equal(
    events.filter((event) => event.type === 'run_recovery').length,
    1,
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'message_chunk' && event.content.includes('已继续'),
    ),
  );
  assert.ok(!events.some((event) => event.type === 'error'));
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('a second empty response ends explicitly, leaves the completed tool result intact and can resume in the same session', async (t) => {
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'write_file',
          args: {
            file_path: '/scratch/completed-step.txt',
            content: 'Written once.',
          },
        },
      ],
    },
    { text: '', reasoning: 'Checking the next step.' },
    { text: '' },
    { text: '继续完成。' },
  ]);
  const sessionId = 'empty-then-manual-continue';
  const events = await f.chat(f.body({ sessionId, turnId: 'first-attempt' }));
  assert.equal(f.fake.requests.length, 3);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'error' &&
        event.payload.subCode === 'model_response_empty',
    ),
  );
  assert.equal(events.at(-1)?.type, 'done');
  const next = await f.chat(
    f.body({
      sessionId,
      turnId: 'continue-attempt',
      messages: [{ role: 'user', content: '继续未完成的任务' }],
    }),
  );
  assert.ok(
    next.some(
      (event) =>
        event.type === 'message_chunk' && event.content.includes('继续完成'),
    ),
  );
  assert.equal(f.fake.requests.length, 4);
  assert.equal(
    next.filter(
      (event) =>
        event.type === 'tool_started' &&
        event.payload.toolName === 'write_file',
    ).length,
    0,
  );
  assert.equal(
    f.fake.requests[3].messages
      .flatMap((message) => message.tool_calls ?? [])
      .filter((call) => call.function.name === 'write_file').length,
    1,
  );
  assert.ok(
    f.fake.requests[3].messages.some((message) => message.role === 'tool'),
  );
  assert.equal(f.fake.state.invalidHistory, 0);
});
