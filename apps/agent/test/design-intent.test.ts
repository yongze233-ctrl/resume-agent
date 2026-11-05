import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, frames } from './helpers.js';
import { defaultResume } from '@magic-resume-kit/resume-schema';

test('opening a canvas selects native resume design even after a creation conversation', async (t) => {
  const f = await fixture(t, 'memory', [{ text: 'Continue in the editable canvas.' }]);
  const events = await f.chat(f.body({ sessionId: 'canvas-intent', mode: 'create', messages: [{ role: 'user', content: '你直接开一个画布，产出一份，然后我想在上面去改' }] }));
  assert.ok(events.some((event) => event.type === 'skill_loaded' && event.payload.skill === 'resume-design'));
  assert.match(JSON.stringify(f.fake.requests[0].messages), /For this turn use skill resume-design/);
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('a from-scratch design request cannot drift into a JSON-only creation proposal', async (t) => {
  const f = await fixture(t, 'memory', [
    { calls: [{ name: 'read_file', args: { file_path: '/skills/resume-creation/SKILL.md' } }] },
    { calls: [{ name: 'write_file', args: { file_path: '/workspace/resume.json', content: JSON.stringify(defaultResume) } }] },
    { text: '继续在原生画布中设计。' },
  ]);
  const events = await f.chat(f.body({ currentResume: defaultResume, sessionId: 'new-design', messages: [{role:'user', content:'给我设计一份简历，我叫小明，大三，找AI产品实习'}] }));
  assert.match(JSON.stringify(f.fake.requests[0].messages), /For this turn use skill resume-design/);
  assert.ok(f.fake.requests[0].tools?.some(tool=>tool.function.name==='design_resume'));
  assert.match(JSON.stringify(f.fake.requests.at(-1)?.messages), /Skill resume-design does not permit write_file/);
  assert.ok(!events.some(event=>event.type==='resume_update' || event.type==='resume_patch'));
});

test('submitting a collection form retains the original design request across the checkpoint', async (t) => {
  const f = await fixture(t, 'sqlite', [
    { calls: [{ name: 'read_file', args: { file_path: '/skills/resume-creation/SKILL.md' } }] },
    { calls: [{ name: 'request_form', args: { formKind: 'create_education', message: '补充学校和专业，也可以跳过。' } }] },
    { calls: [{ name: 'write_file', args: { file_path: '/workspace/resume.json', content: JSON.stringify(defaultResume) } }] },
    { text: '根据已经提供的事实继续设计。' },
  ]);
  const request=f.body({ currentResume:defaultResume, sessionId:'design-form', mode:'create', messages:[{role:'user',content:'给我设计一份简历，我叫小明，大三，找AI产品实习'}] });
  const events=await f.chat(request);
  const paused=events.find(event=>event.type==='tool_approval_request');
  assert.ok(paused && paused.type==='tool_approval_request');
  const state=await f.state('design-form');
  const response=await f.post('/api/chat/approve',{...request,...state.pendingApproval,mode:'general',decisions:[{type:'reject',message:'先跳过，按已知信息设计。'}]});
  assert.equal(response.status,200);
  const resumed=frames(await response.text());
  assert.ok(resumed.some(event=>event.type==='skill_loaded'&&event.payload.skill==='resume-design'));
  assert.match(JSON.stringify(f.fake.requests.at(-1)?.messages), /Skill resume-design does not permit write_file/);
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
