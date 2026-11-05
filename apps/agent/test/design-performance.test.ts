import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.js';
import { VISUAL_TOOLKIT } from '../src/design/pencil-visual.js';
import { RunDiagnostics } from '../src/engine/run-diagnostics.js';

test('a structured update_todos alias executes the advertised write_todos once with validated statuses', async (t) => {
  const todos = [{ content: '检查并导出', status: 'completed' }];
  const f = await fixture(t, 'sqlite', [
    {
      calls: [{ name: 'update_todos', args: { todos: JSON.stringify(todos) } }],
    },
    { text: '完成' },
  ]);
  const events = await f.chat(f.body({ sessionId: 'todo-alias-recovery' }));
  assert.equal(f.fake.requests.length, 2);
  assert.ok(
    events.some(
      (e) =>
        e.type === 'plan_update' &&
        JSON.stringify(e.payload.todos) === JSON.stringify(todos),
    ),
  );
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('hex shorthand is supported and an invalid color cannot leave a partially created node', async () => {
  let created = 0;
  const figma = {
    loadFontAsync: async () => {},
    createText: () => {
      created++;
      return {};
    },
    createRectangle: () => {
      created++;
      return {};
    },
  };
  const visual = await new Function(
    'figma',
    `return (async()=>{${VISUAL_TOOLKIT};return visual;})()`,
  )(figma);
  assert.deepEqual(visual.rgb('#fff'), { r: 1, g: 1, b: 1 });
  assert.deepEqual(visual.rgb('#aBc'), visual.rgb('#aabbcc'));
  assert.throws(
    () => visual.text({}, 'private text', { width: 100, color: 'bad-color' }),
    /hex color/,
  );
  assert.throws(
    () => visual.box({}, { width: 100, height: 1, color: 'bad-color' }),
    /hex color/,
  );
  assert.equal(created, 0);
});

test('timing diagnostics contain numeric usage and statuses, never prompts or tool payloads', () => {
  const d = new RunDiagnostics();
  d.observe({
    event: 'on_chat_model_start',
    name: 'ChatOpenAI',
    run_id: 'm',
    data: { input: 'PRIVATE_KEY' },
  });
  const model = d.observe({
    event: 'on_chat_model_end',
    name: 'ChatOpenAI',
    run_id: 'm',
    data: {
      output: {
        content: 'PRIVATE_RESUME',
        usage_metadata: {
          input_tokens: 12,
          output_tokens: 8,
          output_token_details: { reasoning: 6 },
        },
      },
    },
  });
  assert.equal(model?.reasoningTokens, 6);
  d.observe({
    event: 'on_tool_start',
    name: 'openpencil_edit',
    run_id: 't',
    data: { input: { code: 'PRIVATE_RESUME' } },
  });
  const tool = d.observe({
    event: 'on_tool_end',
    name: 'openpencil_edit',
    run_id: 't',
    data: { output: { content: '{"ok":false,"error":"PRIVATE_RESUME"}' } },
  });
  assert.equal(tool?.failed, true);
  assert.doesNotMatch(JSON.stringify([model, tool]), /PRIVATE/);
});
