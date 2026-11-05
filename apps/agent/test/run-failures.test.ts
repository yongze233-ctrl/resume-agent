import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { fixture, frames } from './helpers.js';

for (const model of ['error-503', 'late-error']) {
  test(`run diagnostics retain ${model} failures without provider data or credentials`, async (t) => {
    const f = await fixture(t);
    const sessionId = `failure-${model}`;
    const input = f.body({ sessionId, config: { ...f.body().config, modelName: model } });
    const response = await f.post('/api/chat', input);
    const text = await response.text();
    if (model === 'late-error') {
      assert.equal(response.status, 200);
      assert.ok(frames(text).some((event) => event.type === 'error'));
    } else assert.equal(response.status, 502);
    const db = new Database(join(f.dataDir, 'checkpoints.sqlite'), { readonly: true });
    const entries = db.prepare('SELECT * FROM run_failures').all() as Array<{ session_id: string; sub_code: string; phase: string }>;
    db.close();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].session_id, sessionId);
    assert.equal(entries[0].sub_code, 'model_unavailable');
    assert.equal(entries[0].phase, model === 'late-error' ? 'stream' : 'prepare');
    assert.doesNotMatch(JSON.stringify(entries), /example-test-key|Alex Chen|Provider detail|apiKey|authorization/i);
  });
}
