import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { createRunBudget, NAME } from '../src/harness/middleware/run-budget.js';
import {
  captureCustom,
  runModel,
  runTool,
  modelRequest,
  toolRequest,
} from './middleware-helpers.js';

test('an empty model response retries once in place, consumes budget and carries verified history forward', async () => {
  const budget = createRunBudget({ modelCalls: 5, toolCalls: 5 });
  let attempts = 0;
  const history = [
    new ToolMessage({
      content: 'Already created frame frame-1',
      tool_call_id: 'created',
      name: 'openpencil_edit',
    }),
  ];
  const { result, events } = await captureCustom(() =>
    runModel(
      budget.middleware(),
      modelRequest({ messages: history }),
      async (request?: unknown) => {
        attempts++;
        const value = request as {
          messages: unknown[];
          systemMessage: { content: unknown };
        };
        assert.equal(value.messages, history);
        if (attempts === 1) return new AIMessage('  \n');
        assert.match(
          String(value.systemMessage.content),
          /do not replay successful mutations/,
        );
        return new AIMessage({
          content: '',
          tool_calls: [
            {
              id: 'review',
              name: 'openpencil_review',
              args: { frameId: 'frame-1' },
              type: 'tool_call',
            },
          ],
        });
      },
    ),
  );
  assert.ok(AIMessage.isInstance(result));
  assert.equal(result.tool_calls?.[0]?.name, 'openpencil_review');
  assert.equal(attempts, 2);
  assert.equal(budget.counts().models, 2);
  assert.equal(
    events.filter((event) => event.name === 'model_retry').length,
    1,
  );
});

test('repeated empties, cancellation and the final-answer reserve never create an unbounded retry loop', async () => {
  for (const [limit, abort, expected] of [
    [5, false, 2],
    [2, false, 1],
    [5, true, 1],
  ] as const) {
    const budget = createRunBudget({ modelCalls: limit, toolCalls: 5 });
    let attempts = 0;
    const controller = new AbortController();
    if (abort) controller.abort();
    await assert.rejects(
      runModel(
        budget.middleware(),
        modelRequest({ runtime: { signal: controller.signal } }),
        async () => {
          attempts++;
          return new AIMessage('');
        },
      ),
      /model_response_empty/,
    );
    assert.equal(attempts, expected);
    assert.equal(budget.counts().models, expected);
  }
});
test('RunBudget shares counts with children, reserves a final answer and refuses excess tools', async () => {
  const budget = createRunBudget({ modelCalls: 3, toolCalls: 1 });
  const root = budget.middleware();
  const child = budget.middleware('child');
  assert.equal(root.name, NAME);
  await runModel(child);
  assert.equal(budget.claimInternal(), true);
  const deniedChild = await runModel(child);
  assert.match(JSON.stringify(deniedChild), /exhausted/);
  let final = false;
  await runModel(
    root,
    modelRequest({ tools: [{ name: 'example' }] }),
    async (request?: unknown) => {
      final = true;
      assert.equal((request as { toolChoice: string }).toolChoice, 'none');
      return new AIMessage('Confirmed results; work remains.');
    },
  );
  assert.ok(final);
  assert.equal(budget.counts().models, 3);
  const extra = await runModel(root);
  assert.match(JSON.stringify(extra), /remaining work/);
  await runTool(root, toolRequest('read_resume', {}));
  const refused = await runTool(child, toolRequest('read_resume', {}));
  assert.ok(ToolMessage.isInstance(refused));
  assert.equal(refused.status, 'error');
  assert.equal(budget.counts().tools, 1);
});

test('a requested wrap-up disables the next tool loop and preserves its actual reason', async () => {
  const budget = createRunBudget({ modelCalls: 20, toolCalls: 40 });
  budget.requestWrapUp(
    '画布草稿已保留，自动审阅仍未通过，请用户直接编辑或保存。',
  );
  await runModel(
    budget.middleware(),
    modelRequest({ tools: [{ name: 'openpencil_edit' }] }),
    async (request?: unknown) => {
      const value = request as {
        tools: unknown[];
        toolChoice: string;
        systemMessage: { content: unknown };
      };
      assert.deepEqual(value.tools, []);
      assert.equal(value.toolChoice, 'none');
      assert.match(
        JSON.stringify(value.systemMessage.content),
        /自动审阅仍未通过/,
      );
      return new AIMessage('草稿可以保存，审阅尚未通过。');
    },
  );
  assert.equal(budget.counts().models, 1);
});
