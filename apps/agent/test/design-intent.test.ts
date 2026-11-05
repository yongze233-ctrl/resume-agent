import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.js';

test('opening a canvas selects native resume design even after a creation conversation', async (t) => {
  const f = await fixture(t, 'memory', [{ text: 'Continue in the editable canvas.' }]);
  const events = await f.chat(f.body({ sessionId: 'canvas-intent', mode: 'create', messages: [{ role: 'user', content: '你直接开一个画布，产出一份，然后我想在上面去改' }] }));
  assert.ok(events.some((event) => event.type === 'skill_loaded' && event.payload.skill === 'resume-design'));
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('ordinary creation messages and an explicit analysis mode retain their workflows', async (t) => {
  const f = await fixture(t, 'memory', [{ text: 'Choose a target.' }, { text: 'Review the resume.' }]);
  for (const input of [
    { mode: 'create', messages: [{ role: 'user', content: '先帮我确定目标岗位' }] },
    { mode: 'analyze', messages: [{ role: 'user', content: '开一个画布来分析简历' }] },
  ]) {
    const events = await f.chat(f.body(input));
    assert.ok(!events.some((event) => event.type === 'skill_loaded' && event.payload.skill === 'resume-design'));
  }
});
