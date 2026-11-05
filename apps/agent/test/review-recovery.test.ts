import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.js';
import { CATEGORIES } from '../src/harness/tools/analyze-resume.js';
const report = JSON.stringify({
  score: 72,
  categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 72])),
  strengths: [],
  weaknesses: [],
  suggestions: [],
  issues: [],
});

test('a malformed reviewer is retried alone; completed reviewers and one final score are retained', async (t) => {
  const f = await fixture(t, 'memory', [
    { text: '{"score":' },
    { text: report },
    { text: report },
    { text: report },
  ]);
  const events = await f.chat(f.body({ mode: 'analyze' }));
  assert.equal(f.fake.requests.length, 4);
  assert.equal(events.filter((e) => e.type === 'resume_analysis').length, 1);
  assert.ok(!events.some((e) => e.type === 'error'));
  const first = String(f.fake.requests[0].messages[0].content);
  const repaired = String(f.fake.requests[3].messages[0].content);
  assert.ok(repaired.startsWith(first));
  assert.match(repaired, /previous attempt failed validation/);
});

test('invalid fields have a precise failure after one retry, never a fake completed score', async (t) => {
  const f = await fixture(t, 'memory', [
    { text: '{}' },
    { text: report },
    { text: report },
    { text: '{}' },
  ]);
  const events = await f.chat(f.body({ mode: 'analyze' }));
  assert.equal(f.fake.requests.length, 4);
  assert.ok(
    !events.some(
      (e) => e.type === 'resume_analysis' || e.type === 'run_completed',
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === 'error' && e.payload.subCode === 'assessment_invalid_fields',
    ),
  );
  assert.ok(
    events.some(
      (e) => e.type === 'resume_analysis_progress' && e.payload.completed === 2,
    ),
  );
});

test('a transient reviewer failure retries even while other perspectives stream; no duplicate successful reviews', async (t) => {
  const f = await fixture(t, 'memory', [
    { status: 503, beforeMs: 35 },
    { text: report },
    { text: report },
    { text: report },
  ]);
  const events = await f.chat(f.body({ mode: 'analyze' }));
  assert.equal(f.fake.requests.length, 4);
  assert.ok(events.some((e) => e.type === 'resume_analysis'));
});

test('network failure followed by invalid JSON still uses at most two attempts for that perspective', async (t) => {
  const f = await fixture(t, 'memory', [
    { status: 503 },
    { text: report },
    { text: report },
    { text: 'broken' },
  ]);
  const events = await f.chat(f.body({ mode: 'analyze' }));
  assert.equal(f.fake.requests.length, 4);
  assert.ok(
    events.some(
      (e) =>
        e.type === 'error' && e.payload.subCode === 'assessment_invalid_json',
    ),
  );
});

test('cancelling a repair never emits a completed report or starts another retry', async (t) => {
  const f = await fixture(
    t,
    'memory',
    [{ text: 'broken' }, { text: report }, { text: report }, { hang: true }],
    { AGENT_RUN_TIMEOUT_MS: '500' },
  );
  const events = await f.chat(f.body({ mode: 'analyze' }));
  assert.equal(f.fake.requests.length, 4);
  assert.ok(!events.some((e) => e.type === 'resume_analysis'));
  assert.ok(
    events.some(
      (e) => e.type === 'error' && e.payload.subCode === 'model_timeout',
    ),
  );
});
