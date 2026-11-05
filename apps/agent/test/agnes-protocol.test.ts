import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatModel } from '../src/model/factory.js';
import {
  parseAgnesCalls,
  providerToolProtocolFetch,
} from '../src/model/native-tool-protocol.js';
import { startFakeModel } from './fake-model.js';
import { fixture, resume } from './helpers.js';
import {
  createPencilSession,
  nextCanvasJob,
  resolveCanvasJob,
} from '../src/design/openpencil-session.js';
import {
  pencilFacts,
  requiredPencilText,
} from '../src/harness/tools/openpencil.js';

const native =
  '<tool_call>\n<function=openpencil_review>\n<parameter=frameId>\n780950035:5\n</parameter>\n</function>\n</tool_call>';
const todos = [{ content: '检查并导出单页 A4', status: 'completed' }];
const todo = `<tool_call><function=write_todos><parameter=todos>${JSON.stringify(todos)}</parameter></function></tool_call>`;
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'openpencil_review',
      description: 'Review',
      parameters: {
        type: 'object',
        properties: { frameId: { type: 'string' } },
        required: ['frameId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_todos',
      description: 'Plan',
      parameters: { type: 'object', properties: { todos: { type: 'array' } } },
    },
  },
];
const allowed = new Map(
  tools.map((tool) => [tool.function.name, tool.function]),
);

test('Agnes native parameters preserve string IDs and decode structured arguments atomically', () => {
  assert.deepEqual(
    parseAgnesCalls(native, allowed).map((call) => ({
      name: call.function.name,
      args: JSON.parse(call.function.arguments),
    })),
    [{ name: 'openpencil_review', args: { frameId: '780950035:5' } }],
  );
  assert.deepEqual(
    JSON.parse(parseAgnesCalls(todo, allowed)[0].function.arguments),
    { todos },
  );
  assert.equal(
    JSON.parse(
      parseAgnesCalls(native.replace('780950035:5', '123'), allowed)[0].function
        .arguments,
    ).frameId,
    '123',
  );
  assert.equal(parseAgnesCalls(native + '\n' + todo, allowed).length, 2);
  for (const bad of [
    native.slice(0, -3),
    native.replace('openpencil_review', 'delete_file'),
    native.replace('frameId', '__proto__'),
    native.replace('frameId', 'unknown'),
    native.replace(
      '</function>',
      '<parameter=frameId>other</parameter></function>',
    ),
    todo.replace(JSON.stringify(todos), '[broken'),
    native + '\n' + todo.replace(JSON.stringify(todos), 'false'),
  ]) {
    assert.throws(
      () => parseAgnesCalls(bad, allowed),
      /model_tool_protocol_invalid/,
    );
  }
});

test('screenshot response streams prose but executes review instead of displaying XML at every token boundary', async (t) => {
  const prose = '坐标已修正。\n\n现在运行最终审查。\n\n';
  const fake = await startFakeModel(0, [
    { text: Array.from(prose + native), reasoning: 'Checking.' },
  ]);
  t.after(fake.close);
  const model = createChatModel(
    {
      source: 'byok',
      baseUrl: fake.baseUrl,
      apiKey: 'example-test-key',
      modelName: 'agnes-3.0-flash',
    },
    fetch,
  );
  let callbackText = '';
  const result = await model.bindTools(tools).invoke('Review', {
    callbacks: [
      {
        handleLLMNewToken(token) {
          callbackText += token;
        },
      },
    ],
  });
  assert.equal(result.content, prose);
  assert.equal(callbackText, prose);
  assert.equal(result.tool_calls?.length, 1);
  assert.deepEqual(result.tool_calls?.[0].args, { frameId: '780950035:5' });
  assert.equal(result.tool_calls?.[0].name, 'openpencil_review');
  assert.equal(result.usage_metadata?.total_tokens, 20);
});

test('quoted, inline, indented and fenced examples stay text; real call after a fence is recovered', async (t) => {
  const examples = [
    '普通内容。',
    '示例：`' + native.replaceAll('\n', '') + '`',
    '> ' + native.replaceAll('\n', ''),
    '    ' + native.replaceAll('\n', ''),
    '```xml\n' + native + '\n```\n',
    '~~~text\n' + native + '\n~~~\n',
  ];
  const fake = await startFakeModel(0, [
    ...examples.map((text) => ({ text: Array.from(text) })),
    { text: Array.from(examples[4] + native) },
  ]);
  t.after(fake.close);
  const model = createChatModel(
    {
      source: 'byok',
      baseUrl: fake.baseUrl,
      apiKey: 'example-test-key',
      modelName: 'agnes-3.0-flash',
    },
    fetch,
  ).bindTools(tools);
  for (const example of examples) {
    const result = await model.invoke('Explain');
    assert.equal(result.content, example);
    assert.equal(result.tool_calls?.length, 0);
  }
  const result = await model.invoke('Review');
  assert.equal(result.content, examples[4]);
  assert.equal(result.tool_calls?.length, 1);
});

test('standard calls win over a duplicate textual call; unrelated models are untouched', async (t) => {
  const fake = await startFakeModel(0, [
    {
      text: native,
      calls: [{ name: 'openpencil_review', args: { frameId: '780950035:5' } }],
    },
    { text: native },
  ]);
  t.after(fake.close);
  const config = {
    source: 'byok' as const,
    baseUrl: fake.baseUrl,
    apiKey: 'example-test-key',
    modelName: 'agnes-3.0-flash',
  };
  const result = await createChatModel(config, fetch)
    .bindTools(tools)
    .invoke('Review');
  assert.equal(result.tool_calls?.length, 1);
  assert.equal(result.content, '');
  assert.equal(
    (
      await createChatModel({ ...config, modelName: 'other-model' }, fetch)
        .bindTools(tools)
        .invoke('Explain')
    ).content,
    native,
  );
});

test('disabled, unknown and incomplete calls fail without leaking or running their parameters', async (t) => {
  const fake = await startFakeModel(0, [
    { text: native },
    { text: native.slice(0, -5) },
    { text: native.replace('openpencil_review', 'delete_file') },
  ]);
  t.after(fake.close);
  const model = createChatModel(
    {
      source: 'byok',
      baseUrl: fake.baseUrl,
      apiKey: 'example-test-key',
      modelName: 'agnes-3.0-flash',
    },
    fetch,
  );
  for (const options of [
    { tools, tool_choice: 'none' as const },
    { tools },
    { tools },
  ]) {
    let output = '';
    await assert.rejects(async () => {
      for await (const chunk of await model.stream('Review', options))
        output += chunk.content;
    }, /model_tool_protocol_invalid/);
    assert.equal(output, '');
  }
});

test('length-limited native calls are never executed even with a closing marker', async () => {
  const body =
    [
      {
        choices: [
          { index: 0, delta: { content: native }, finish_reason: null },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] },
    ]
      .map((x) => `data: ${JSON.stringify(x)}\n\n`)
      .join('') + 'data: [DONE]\n\n';
  const adapted = providerToolProtocolFetch(
    async () =>
      new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
  );
  const response = await adapted('http://test.invalid', {
    body: JSON.stringify({ model: 'agnes-3.0-flash', stream: true, tools }),
  });
  await assert.rejects(response.text(), /model_tool_protocol_invalid/);
});

test('actual agent loop executes the recovered call once, updates todos and continues with valid checkpoint history', async (t) => {
  const f = await fixture(t, 'sqlite', [
    { text: ['正在完成检查。\n', todo] },
    { text: '检查已完成。' },
  ]);
  const body = f.body({ sessionId: 'agnes-native-recovery' });
  body.config.modelName = 'agnes-3.0-flash';
  const events = await f.chat(body);
  assert.equal(
    events.filter(
      (e) => e.type === 'tool_started' && e.payload.toolName === 'write_todos',
    ).length,
    1,
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === 'plan_update' &&
        Array.isArray(e.payload.todos) &&
        e.payload.todos[0]?.status === 'completed',
    ),
  );
  assert.ok(
    events.some(
      (e) => e.type === 'message_chunk' && e.content.includes('检查已完成'),
    ),
  );
  assert.ok(!JSON.stringify(events).includes('<tool_call>'));
  assert.equal(f.fake.requests.length, 2);
  assert.equal(f.fake.state.invalidHistory, 0);
});

test('native review reaches the canvas export and visual review, then completes the plan', async (t) => {
  const canvas = createPencilSession(resume, '验证单页简历最终检查');
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'read_file',
          args: { file_path: '/skills/resume-design/SKILL.md' },
        },
      ],
    },
    { text: ['现在运行最终审查。\n\n', native] },
    {
      text: JSON.stringify({
        summary: '版式可读，无重叠。',
        needsAdjustment: false,
      }),
    },
    { text: todo },
    { text: '审查与导出已完成。' },
  ]);
  let exports = 0;
  const pump = setInterval(() => {
    const job = nextCanvasJob(canvas);
    if (!job) return;
    assert.equal(job.operation, 'bundle');
    exports++;
    resolveCanvasJob(canvas, job.id, {
      ok: true,
      result: {
        pdf: 'example-pdf-bytes',
        fig: 'example-native-fig',
        pdfText: requiredPencilText(pencilFacts(resume)).join('\n'),
        image: { result: { base64: 'example-image-data' } },
        pages: [{ width: 595.28, height: 841.89 }],
        inspection: { width: 595.28, height: 841.89, nodes: [] },
      },
    });
  }, 5);
  t.after(() => clearInterval(pump));
  const body = f.body({
    sessionId: 'agnes-review-recovery',
    designContext: {
      sessionId: canvas.id,
      sourceHash: canvas.sourceHash,
      frameId: '780950035:5',
    },
  });
  body.config.modelName = 'agnes-3.0-flash';
  const events = await f.chat(body);
  assert.ok(!events.some((e) => e.type === 'error'));
  assert.equal(exports, 1);
  assert.equal(
    events.filter(
      (e) =>
        e.type === 'tool_started' && e.payload.toolName === 'openpencil_review',
    ).length,
    1,
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === 'plan_update' &&
        Array.isArray(e.payload.todos) &&
        e.payload.todos[0]?.status === 'completed',
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === 'message_chunk' && e.content.includes('审查与导出已完成'),
    ),
  );
  assert.ok(canvas.bundle);
  assert.ok(!JSON.stringify(events).includes('<tool_call>'));
  assert.equal(f.fake.state.invalidHistory, 0);
});
