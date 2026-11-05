import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatModel } from '../src/model/factory.js';
import { parseDeepSeekCalls } from '../src/model/deepseek-protocol.js';
import { startFakeModel } from './fake-model.js';
import { fixture } from './helpers.js';

const todos = [{ content: '核对一页原文', status: 'completed' }];
const native = `<｜DSML｜ calls><｜DSML｜ invoke name="write_todos"><｜DSML｜ parameter name="todos" string="false">${JSON.stringify(todos)}</｜DSML｜ parameter></｜DSML｜ invoke></｜DSML｜ calls>`;
const tools = [{ type: 'function' as const, function: { name: 'write_todos', description: 'Update plan', parameters: { type: 'object', properties: { todos: { type: 'array' } } } } }];

test('native calls parse JSON parameters atomically and reject unknown/duplicate/invalid arguments', () => {
  const allowed = new Set(['write_todos']);
  assert.deepEqual(JSON.parse(parseDeepSeekCalls(native, allowed)[0].function.arguments), { todos });
  for (const bad of [native.slice(0, -5), native.replace('write_todos', 'delete_file'), native.replace(JSON.stringify(todos), '[broken'), native.replace('name="todos"', 'name="__proto__"'), native.replace('</｜DSML｜ invoke>', '<｜DSML｜ parameter name="todos" string="false">[]</｜DSML｜ parameter></｜DSML｜ invoke>')]) assert.throws(() => parseDeepSeekCalls(bad, allowed), /model_tool_protocol_invalid/);
});

test('split native markers never reach SDK text callbacks and become a standard executable call', async (t) => {
  const fake = await startFakeModel(0, [{ text: Array.from(native), reasoning: 'Checking.' }]); t.after(fake.close);
  const model = createChatModel({ source: 'byok' as const, baseUrl: fake.baseUrl, apiKey: 'example-test-key', modelName: 'deepseek-test' }, fetch);
  let callbackText = '';
  const result = await model.bindTools(tools).invoke('Update progress', { callbacks: [{ handleLLMNewToken(token) { callbackText += token; } }] });
  assert.equal(result.content, ''); assert.equal(callbackText, '');
  assert.equal(result.tool_calls?.length, 1); assert.equal(result.tool_calls?.[0].name, 'write_todos'); assert.deepEqual(result.tool_calls?.[0].args, { todos });
  assert.equal(result.usage_metadata?.total_tokens, 20);
});

test('the real harness executes a recovered todo exactly once and continues to a readable answer', async (t) => {
  const f = await fixture(t, 'memory', [{ text: Array.from(native) }, { text: '原文核对完成。' }]);
  const body = f.body({ sessionId: 'dsml-compatibility' });
  body.config.modelName = 'deepseek-test';
  const events = await f.chat(body);
  assert.equal(events.filter(e => e.type === 'tool_started' && e.payload.toolName === 'write_todos').length, 1);
  assert.ok(events.some(e => e.type === 'plan_update' && Array.isArray(e.payload.todos) && e.payload.todos[0]?.status === 'completed'));
  assert.ok(events.some(e => e.type === 'message_chunk' && e.content.includes('原文核对完成')));
  assert.ok(!JSON.stringify(events).includes('DSML'));
  assert.equal(f.fake.requests.length, 2);
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('standard calls take precedence over duplicate native serialization', async (t) => {
  const fake = await startFakeModel(0, [{ text: [native], calls: [{ name: 'write_todos', args: { todos } }] }]); t.after(fake.close);
  const model = createChatModel({ source: 'byok' as const, baseUrl: fake.baseUrl, apiKey: 'example-test-key', modelName: 'deepseek-test' }, fetch);
  const result = await model.bindTools(tools).invoke('Update');
  assert.equal(result.tool_calls?.length, 1); assert.equal(result.content, '');
});

test('ordinary streaming text, quoted protocol examples and non-DeepSeek providers are preserved', async (t) => {
  const example = '协议示例：\n```text\n' + native + '\n```';
  const fake = await startFakeModel(0, [{ text: ['你', '好。'] }, { text: [example] }, { text: [native] }]); t.after(fake.close);
  const config = { source: 'byok' as const, baseUrl: fake.baseUrl, apiKey: 'example-test-key', modelName: 'deepseek-test' };
  const model = createChatModel(config, fetch).bindTools(tools);
  assert.equal((await model.invoke('Hello')).content, '你好。');
  assert.equal((await model.invoke('Explain protocol')).content, example);
  assert.equal((await createChatModel({ ...config, modelName: 'other-model' }, fetch).bindTools(tools).invoke('Example')).content, native);
});

test('truncated or unadvertised calls fail without leaking protocol or bypassing disabled tools', async (t) => {
  const fake = await startFakeModel(0, [{ text: [native.slice(0, -15)] }, { text: [native] }, { text: [native.replace('write_todos', 'delete_file')] }]); t.after(fake.close);
  const model = createChatModel({ source: 'byok' as const, baseUrl: fake.baseUrl, apiKey: 'example-test-key', modelName: 'deepseek-test' }, fetch);
  for (const options of [{ tools }, { tools, tool_choice: 'none' as const }, { tools }]) {
    let text = '';
    await assert.rejects(async () => { for await (const chunk of await model.stream('Update', options)) text += chunk.content; }, /model_tool_protocol_invalid/);
    assert.equal(text, '');
  }
});
