import assert from 'node:assert/strict';
import test from 'node:test';
import { providerModelKwargs, opencodeGoHeaders } from '../src/model/factory.js';
import type { ModelConfig } from '../src/contracts/model-config.js';

test('Agnes uses its documented Thinking flag while other providers retain their effort contract', () => {
  const config: ModelConfig = { source: 'byok', apiKey: 'example-key', baseUrl: 'https://apihub.agnes-ai.com/v1', modelName: 'agnes-3.0-flash' };
  assert.deepEqual(providerModelKwargs(config), {});
  assert.deepEqual(providerModelKwargs({ ...config, effort: 'low' }), { chat_template_kwargs: { enable_thinking: false } });
  for (const effort of ['medium', 'high'] as const) assert.deepEqual(providerModelKwargs({ ...config, effort }), { chat_template_kwargs: { enable_thinking: true } });
  assert.deepEqual(providerModelKwargs({ ...config, baseUrl: 'https://api.agnes-ai.cn/v1', effort: 'high' }), { chat_template_kwargs: { enable_thinking: true } });
  assert.deepEqual(providerModelKwargs({ ...config, baseUrl: 'https://opencode.ai/zen/go/v1', modelName: 'deepseek-v4.1-flash', effort: 'high' }), { reasoning_effort: 'high' });
  assert.equal(opencodeGoHeaders(config.baseUrl), undefined);
});
