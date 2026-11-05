import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { safeModelFailure } from '../src/model/errors.js';
import { AgentError } from '../src/contracts/errors.js';
import {
  createModelResilience,
  NAME,
  retryable,
  withModelRetry,
} from '../src/harness/middleware/model-resilience.js';

test('real OpenAI SDK timeout class is retryable even though its Error.name is generic', () => {
  const require = createRequire(import.meta.url);
  const sdkRequire = createRequire(require.resolve('@langchain/openai'));
  const { APIConnectionTimeoutError } = sdkRequire('openai');
  const original = new APIConnectionTimeoutError();
  assert.equal(original.name, 'Error');
  const failure = safeModelFailure(original);
  assert.equal(failure.payload.subCode, 'model_timeout');
  assert.equal(retryable(failure), true);
  const { APIConnectionError } = sdkRequire('openai');
  const wrapped = safeModelFailure(new APIConnectionError({ cause: failure }));
  assert.equal(wrapped, failure);
  assert.equal(retryable(wrapped), true);
});
test('ModelResilience retries only transient failures before output and honors cancellation', async () => {
  assert.equal(createModelResilience(() => 0).name, NAME);
  for (const status of [401, 402, 403, 404, 400])
    assert.equal(retryable({ status }), false);
  for (const status of [429, 500, 503])
    assert.equal(retryable({ status }), true);
  assert.equal(
    retryable({ status: 429, error: { code: 'insufficient_quota' } }),
    false,
  );
  let attempts = 0;
  const result = await withModelRetry(
    async () => {
      if (attempts++ === 0) throw { status: 503 };
      return 'success';
    },
    { emitted: () => 0, delayMs: 1 },
  );
  assert.equal(result, 'success');
  assert.equal(attempts, 2);
  let emitted = 0;
  attempts = 0;
  await assert.rejects(
    withModelRetry(
      async () => {
        attempts++;
        emitted++;
        throw new Error('Connection interrupted');
      },
      { emitted: () => emitted, delayMs: 1 },
    ),
  );
  assert.equal(attempts, 1);
  const controller = new AbortController();
  controller.abort();
  assert.equal(retryable(new Error(), controller.signal), false);
});

test('arbitrary execution errors are not network retries and deep middleware wrapping retains provider status', () => {
  assert.equal(retryable(new Error('Invalid state')), false);
  let failure: unknown = { status: 503 };
  for (let i = 0; i < 25; i++)
    failure = new Error('Middleware failed', { cause: failure });
  assert.equal(retryable(failure), true);
});

test('connection timeouts remain retryable after sanitization, without retrying cancellation or a partial reply', async () => {
  for (const error of [
    Object.assign(new Error('private provider details'), {
      name: 'APIConnectionTimeoutError',
    }),
    new TypeError('fetch failed', {
      cause: Object.assign(new Error('private network details'), {
        code: 'UND_ERR_CONNECT_TIMEOUT',
      }),
    }),
    new TypeError('fetch failed', {
      cause: Object.assign(new Error('private network details'), {
        code: 'ECONNRESET',
      }),
    }),
  ]) {
    const failure = safeModelFailure(error);
    assert.equal(retryable(failure), true);
    assert.ok(!JSON.stringify(failure).includes('private'));
    let attempts = 0;
    const notices: number[] = [];
    const result = await withModelRetry(
      async () => {
        if (++attempts === 1) throw failure;
        return 'ok';
      },
      {
        emitted: () => 0,
        delayMs: 1,
        onRetry: async (attempt) => {
          notices.push(attempt);
        },
      },
    );
    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
    assert.deepEqual(notices, [1]);
  }
  const failure = safeModelFailure(
    Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' }),
  );
  let emitted = 0;
  let attempts = 0;
  await assert.rejects(
    withModelRetry(
      async () => {
        attempts++;
        emitted++;
        throw failure;
      },
      { emitted: () => emitted, delayMs: 1 },
    ),
    AgentError,
  );
  assert.equal(attempts, 1);
  const control = new AbortController();
  attempts = 0;
  await assert.rejects(
    withModelRetry(
      async () => {
        attempts++;
        throw failure;
      },
      {
        emitted: () => 0,
        delayMs: 50,
        signal: control.signal,
        onRetry: async () => {
          control.abort();
        },
      },
    ),
  );
  assert.equal(attempts, 1);
});
