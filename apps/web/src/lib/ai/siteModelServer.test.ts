import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { publicSiteModel, resolveSiteModelBody, resolveSiteModelConfig } from './siteModelServer';

function provision(t: TestContext) {
  const names = ['DEFAULT_MODEL_API_KEY', 'DEFAULT_MODEL_BASE_URL', 'DEFAULT_MODEL_NAME', 'DEFAULT_MODEL_MAX_TOKENS', 'LOCAL_DEFAULT_MODEL_SETUP_ID'];
  const previous = names.map((name) => process.env[name]);
  names.forEach((name) => delete process.env[name]);
  process.env.DEFAULT_MODEL_API_KEY = 'test-server-credential';
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
  }));
}

test('site metadata never exposes the model credential; an unprovisioned site offers no default', (t) => {
  provision(t);
  const metadata = publicSiteModel();
  assert.equal(metadata?.model, 'deepseek-v4.1-flash');
  assert.doesNotMatch(JSON.stringify(metadata), /test-server-credential|apiKey/);
  delete process.env.DEFAULT_MODEL_API_KEY;
  assert.equal(publicSiteModel(), null);
  assert.throws(() => resolveSiteModelConfig({ source: 'server' }), /not configured/);
});

test('a client cannot redirect the shared credential or choose another paid model', (t) => {
  provision(t);
  const config = resolveSiteModelConfig({ source: 'server', baseUrl: 'https://attacker.invalid', modelName: 'other-model', maxTokens: 999999, apiKey: 'ignored', effort: 'high' });
  assert.deepEqual(config, { source: 'byok', apiKey: 'test-server-credential', baseUrl: 'https://opencode.ai/zen/go/v1', modelName: 'deepseek-v4.1-flash', maxTokens: 12000, effort: 'high' });
  const own = { source: 'byok', apiKey: 'personal-key', baseUrl: 'https://personal.invalid/v1' };
  assert.equal(resolveSiteModelConfig(own), own);
});

test('Agnes is recognized without exposing its credential or accepting client model overrides', (t) => {
  provision(t);
  process.env.DEFAULT_MODEL_BASE_URL = 'https://apihub.agnes-ai.com/v1/';
  process.env.DEFAULT_MODEL_NAME = 'agnes-3.0-flash';
  process.env.DEFAULT_MODEL_MAX_TOKENS = '16384';
  assert.deepEqual(publicSiteModel(), { provider: 'agnes-token-plan', baseUrl: 'https://apihub.agnes-ai.com/v1', model: 'agnes-3.0-flash', maxTokens: 16384 });
  const resolved = resolveSiteModelConfig({ source: 'server', baseUrl: 'https://attacker.invalid', modelName: 'agnes-3.0-pro', effort: 'high' }) as Record<string, unknown>;
  assert.equal(resolved.baseUrl, 'https://apihub.agnes-ai.com/v1');
  assert.equal(resolved.modelName, 'agnes-3.0-flash');
  assert.equal(resolved.apiKey, 'test-server-credential');
  assert.equal(resolved.effort, 'high');
});

test('JSON chat, binary proxy JSON and multipart imports resolve only their model reference', async (t) => {
  provision(t);
  const original = { config: { source: 'server' }, messages: [{ role: 'user', content: 'Example request' }] };
  for (const body of [JSON.stringify(original), new TextEncoder().encode(JSON.stringify(original)).buffer]) {
    const forwarded = JSON.parse(resolveSiteModelBody(body, 'application/json') as string);
    assert.equal(forwarded.config.apiKey, 'test-server-credential');
    assert.deepEqual(forwarded.messages, original.messages);
  }
  const form = new FormData();
  form.set('config', JSON.stringify({ source: 'server' }));
  form.set('file', new File(['Example resume'], 'resume.txt', { type: 'text/plain' }));
  resolveSiteModelBody(form, '');
  assert.equal(JSON.parse(form.get('config') as string).apiKey, 'test-server-credential');
  assert.equal(await (form.get('file') as File).text(), 'Example resume');
  const invalid = new FormData(); invalid.set('config', 'invalid JSON');
  assert.equal(resolveSiteModelBody(invalid, ''), invalid);
});
