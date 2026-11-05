import assert from 'node:assert/strict';
import test from 'node:test';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import {
  createSkillFirewall,
  NAME,
} from '../src/harness/middleware/skill-firewall.js';
import { runTool, toolRequest } from './middleware-helpers.js';
test('SkillFirewall activates on normalized skill reads and replaces the previous policy', async () => {
  const firewall = createSkillFirewall(
    new Map([
      ['analysis', { allowedTools: ['analyze_resume'] }],
      ['rewrite', { allowedTools: ['write_file'] }],
    ]),
  );
  assert.equal(firewall.name, NAME);
  await runTool(
    firewall,
    toolRequest('read_file', { file_path: '/skills/rewrite/SKILL.md' }),
  );
  assert.doesNotMatch(
    JSON.stringify(await runTool(firewall, toolRequest('write_file', {}))),
    /does not permit/,
  );
  await runTool(
    firewall,
    toolRequest('read_file', {
      file_path: '/skills/rewrite/../analysis/SKILL.md',
    }),
  );
  assert.match(
    JSON.stringify(await runTool(firewall, toolRequest('write_file', {}))),
    /does not permit/,
  );
  assert.doesNotMatch(
    JSON.stringify(await runTool(firewall, toolRequest('write_todos', {}))),
    /does not permit/,
  );
});

test('an explicit canvas task keeps design permissions when another skill is read as reference', async () => {
  const firewall = createSkillFirewall(new Map([
    ['resume-design', { allowedTools: ['design_resume', 'openpencil_edit', 'openpencil_review', 'request_form'] }],
    ['resume-creation', { allowedTools: ['write_file'] }],
    ['resume-parse', { allowedTools: [] }],
  ]), 'resume-design');
  for (const skill of ['resume-creation', 'resume-parse']) {
    const reference = await runTool(firewall, toolRequest('read_file', { file_path: `/skills/${skill}/SKILL.md` }));
    assert.match(JSON.stringify(reference), /active task is still resume-design/);
    assert.match(JSON.stringify(await runTool(firewall, toolRequest('write_file', {}))), /does not permit/);
    assert.doesNotMatch(JSON.stringify(await runTool(firewall, toolRequest('design_resume', {}))), /does not permit/);
    assert.doesNotMatch(JSON.stringify(await runTool(firewall, toolRequest('request_form', {}))), /does not permit/);
  }
});

test('a completed checklist requires a successful review after the latest canvas edit in this task', async () => {
  const firewall = createSkillFirewall(new Map([['resume-design', { allowedTools: [] }]]), 'resume-design');
  const result = (name: string, content: string) => new ToolMessage({ name, content, tool_call_id: name });
  const human = new HumanMessage('设计一份简历');
  const reviewed = result('openpencil_review', '{"ready":true}');
  const check = (messages: Array<HumanMessage | ToolMessage>) => runTool(firewall, toolRequest('write_todos', {
    todos: [{ content: '设计并检查一页简历', status: 'completed' }],
  }, { state: { messages } }));
  for (const messages of [
    [human],
    [human, result('write_file', 'Successfully wrote resume.json')],
    [human, result('openpencil_review', '{"ready":false}')],
    [reviewed, human],
    [human, reviewed, result('openpencil_edit', '{"ok":true}')],
  ]) assert.match(JSON.stringify(await check(messages)), /has not passed review/);
  assert.doesNotMatch(JSON.stringify(await check([human, result('openpencil_edit','{}'), reviewed])), /has not passed review/);
  assert.doesNotMatch(JSON.stringify(await runTool(firewall, toolRequest('write_todos', {
    todos: [{ content: '收集事实', status: 'completed' }, { content: '画布与检查', status: 'pending' }],
  }))), /has not passed review/);
});
