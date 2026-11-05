import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

test('local setup refuses cross-site, external-host and wrong-origin access', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json({}); });
  for (const request of [
    new NextRequest('http://example.com/api/local-model-setup'),
    new NextRequest('http://127.0.0.1:3000/api/local-model-setup', { headers: { 'sec-fetch-site': 'cross-site' } }),
    new NextRequest('http://127.0.0.1:3000/api/local-model-setup', { headers: { origin: 'https://example.com' } }),
  ]) {
    assert.equal((await GET(request)).status, 403);
    assert.equal((await POST(request)).status, 403);
  }
  assert.equal(requests, 0);
});

test('local handoff is no-store and can acknowledge a 127.0.0.1 browser behind a normalized localhost URL', async (t) => {
  const previousUrl = process.env.LOCAL_MODEL_SETUP_URL;
  const previousToken = process.env.LOCAL_MODEL_SETUP_TOKEN;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.LOCAL_MODEL_SETUP_URL; else process.env.LOCAL_MODEL_SETUP_URL = previousUrl;
    if (previousToken === undefined) delete process.env.LOCAL_MODEL_SETUP_TOKEN; else process.env.LOCAL_MODEL_SETUP_TOKEN = previousToken;
  });
  process.env.LOCAL_MODEL_SETUP_URL = 'http://127.0.0.1:4012/setup';
  process.env.LOCAL_MODEL_SETUP_TOKEN = 'example-handoff-token';
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requests.push(init);
    return Response.json({ setupId: 'example-setup', provider: 'opencode-go', apiKey: 'example-model-key' });
  });
  const response = await GET(new NextRequest('http://localhost:3000/api/local-model-setup'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const receipt = await POST(new NextRequest('http://localhost:3000/api/local-model-setup', {
    method: 'POST',
    headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', referer: 'http://127.0.0.1:3000/dashboard' },
    body: JSON.stringify({ setupId: 'example-setup' }),
  }));
  assert.equal(receipt.status, 204);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, 'POST');
  assert.equal(new Headers(requests[1].headers).get('x-setup-page'), '/dashboard');
});
