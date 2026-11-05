import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.js';
import { CATEGORIES } from '../src/harness/tools/analyze-resume.js';

const persona = JSON.stringify({
  score: 74,
  categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 74])),
  strengths: [],
  weaknesses: [],
  suggestions: [],
  issues: [],
});

test('explicit review bypasses planner rounds, keeps provider/model and bounds three structured requests', async (t) => {
  const f = await fixture(
    t,
    'memory',
    Array.from({ length: 3 }, () => ({ text: persona, beforeMs: 25 })),
  );
  const input = f.body({
    mode: 'analyze',
    config: { ...f.body().config, effort: 'high', maxTokens: 100_000 },
  });
  const events = await f.chat(input);
  assert.equal(f.fake.requests.length, 3);
  assert.ok(
    f.fake.requests.every(
      (request) =>
        request.model === input.config.modelName &&
        request.reasoning_effort === 'low' &&
        request.max_tokens === 4096 &&
        !request.tools?.length,
    ),
  );
  assert.equal(
    events.filter((event) => event.type === 'resume_analysis').length,
    1,
  );
  assert.equal(events.filter((event) => event.type === 'error').length, 0);
  assert.equal(
    events.filter((event) => event.type === 'run_completed').length,
    1,
  );
  assert.ok(events.some((event) => event.type === 'message_chunk'));
});

test('cancelling an explicit review aborts its requests and never produces a complete score', async (t) => {
  const f = await fixture(
    t,
    'memory',
    [{ text: persona }, { text: persona }, { hang: true }],
    { AGENT_RUN_TIMEOUT_MS: '120' },
  );
  const events = await f.chat(f.body({ mode: 'analyze' }));
  assert.equal(
    events.some((event) => event.type === 'resume_analysis'),
    false,
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'error' && event.payload.subCode === 'model_timeout',
    ),
  );
  assert.equal(
    events.some((event) => event.type === 'run_completed'),
    false,
  );
});
