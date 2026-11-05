import assert from 'node:assert/strict';
import test from 'node:test';
import { opencodeGoHeaders } from '../src/model/factory.js';

test('Go endpoints receive a stable session and other providers never receive it', () => {
  const headers = opencodeGoHeaders('https://opencode.ai/zen/go/v1');
  assert.match(headers?.['x-opencode-session'] ?? '', /^ses_magic_resume_[a-f0-9]+$/);
  assert.deepEqual(opencodeGoHeaders('https://opencode.ai/zen/go/v1/'), headers);
  assert.deepEqual(opencodeGoHeaders('https://opencode.ai/inference/go/openai/v1'), headers);
  for (const url of ['https://opencode.ai/zen/v1', 'https://example.com/zen/go/v1', 'https://opencode.ai.example.com/zen/go/v1', 'http://opencode.ai/zen/go/v1']) {
    assert.equal(opencodeGoHeaders(url), undefined);
  }
});
