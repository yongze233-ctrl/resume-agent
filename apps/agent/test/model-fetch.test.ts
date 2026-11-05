import assert from 'node:assert/strict';
import test from 'node:test';
import { readSettings } from '../src/config.js';
import { AgentError } from '../src/contracts/errors.js';
import {
  createModelTransport,
  isPublicAddress,
  resolveModelAddresses,
} from '../src/model/transport.js';
import { startFakeModel } from './fake-model.js';
import { createServer } from 'node:http';

test('successive model rounds reuse validated connections instead of repeating the TLS/TCP handshake', async (t) => {
  const ports = new Set<number | undefined>();
  const server = createServer((req, res) => {
    ports.add(req.socket.remotePort);
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const transport = await createModelTransport(
    `http://127.0.0.1:${port}`,
    true,
    new AbortController().signal,
  );
  t.after(async () => {
    await transport.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  for (let i = 0; i < 6; i++)
    assert.equal(
      await (await transport.fetch(`http://127.0.0.1:${port}/v1`)).text(),
      'ok',
    );
  assert.ok(ports.size <= 2, `expected pooled connections, got ${ports.size}`);
});

test('rejects local, private, metadata and non-routable IPs, including alternate encodings', async () => {
  const settings = readSettings({
    NODE_ENV: 'production',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
  });
  for (const host of [
    '127.0.0.1',
    '127.1',
    '2130706433',
    '0x7f000001',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '[::]',
    '[::1]',
    '[::ffff:127.0.0.1]',
    '[fc00::1]',
    '[fe80::1]',
    'localhost',
    'localhost.',
    'model.localhost',
    'metadata.google.internal',
  ]) {
    await assert.rejects(
      resolveModelAddresses(
        new URL(`http://${host}/v1`),
        settings.allowPrivateModelHosts,
        new AbortController().signal,
      ),
      (error: unknown) =>
        error instanceof AgentError &&
        error.payload.subCode === 'model_host_blocked',
      host,
    );
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('checks every DNS answer, rejects empty or failing DNS and supports development opt-in', async () => {
  const signal = new AbortController().signal;
  const url = new URL('https://model.example.com/v1');
  for (const answers of [
    [{ address: '10.0.0.1', family: 4 }],
    [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ],
    [],
  ]) {
    await assert.rejects(
      resolveModelAddresses(url, false, signal, async () => answers),
      AgentError,
    );
  }
  await assert.rejects(
    resolveModelAddresses(url, false, signal, async () => {
      throw new Error('DNS details');
    }),
    (error: unknown) =>
      error instanceof AgentError &&
      error.payload.subCode === 'model_dns_failed',
  );
  const allowed = await resolveModelAddresses(
    new URL('http://localhost/v1'),
    true,
    signal,
    async () => [{ address: '127.0.0.1', family: 4 }],
  );
  assert.equal(allowed[0].address, '127.0.0.1');
});

test('pins the validated DNS address, preserves Host and rejects changed origins and redirects', async (t) => {
  const fake = await startFakeModel();
  t.after(fake.close);
  const base = new URL(fake.baseUrl);
  base.hostname = 'model.example.com';
  let resolutions = 0;
  const transport = await createModelTransport(
    base.href,
    true,
    new AbortController().signal,
    async () => {
      resolutions += 1;
      return [
        { address: resolutions === 1 ? '127.0.0.1' : '10.0.0.1', family: 4 },
      ];
    },
  );
  t.after(() => transport.close());
  for (let i = 0; i < 2; i += 1) {
    const response = await transport.fetch(`${base.href}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ model: 'example', messages: [] }),
    });
    assert.equal(response.status, 200);
    await response.text();
  }
  assert.equal(resolutions, 1);
  assert.deepEqual(fake.hosts, [
    `model.example.com:${base.port}`,
    `model.example.com:${base.port}`,
  ]);
  await assert.rejects(
    transport.fetch('https://other.example.com/v1/chat/completions'),
    AgentError,
  );
  await assert.rejects(
    transport.fetch(`${base.href}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ model: 'redirect', messages: [] }),
    }),
    (error: unknown) =>
      error instanceof AgentError &&
      error.payload.subCode === 'model_redirect_blocked',
  );
  assert.equal(fake.state.unexpected, 0);
});

test('an unreachable first IPv6 answer falls back to a pinned IPv4 answer without re-resolving DNS', async (t) => {
  const fake = await startFakeModel();
  t.after(fake.close);
  const base = new URL(fake.baseUrl);
  base.hostname = 'model.example.com';
  let resolutions = 0;
  const transport = await createModelTransport(
    base.href,
    true,
    new AbortController().signal,
    async () => {
      resolutions++;
      return [
        { address: '::1', family: 6 },
        { address: '127.0.0.1', family: 4 },
      ];
    },
  );
  t.after(transport.close);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await transport.fetch(`${base.href}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ model: 'example', messages: [] }),
    });
    assert.equal(response.status, 200);
    await response.text();
  }
  assert.equal(resolutions, 1);
  assert.equal(fake.requests.length, 3);
  assert.ok(
    fake.hosts.every((host) => host === `model.example.com:${base.port}`),
  );
});
