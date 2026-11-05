import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamChatWithInputRecovery, AgentRequestError, type ChatStreamParams } from './agentClient';
import { appErrorCopy } from '@/lib/errors/message';
import zh from '@/locales/zh/translation.json';
import en from '@/locales/en/translation.json';

const params: ChatStreamParams = {
  sessionId: 'paused', turnId: 'new-turn', mode: 'create', agentMode: 'cocreate',
  messages: [{ role: 'assistant', content: 'Choose a role.' }, { role: 'user', content: 'Open a canvas instead.' }],
  currentResume: { info: { fullName: 'Example' }, sections: {} },
  config: { baseUrl: 'https://model.example/v1', apiKey: 'example-test-key', modelName: 'example-model' },
};
const conflict = (subCode = 'session_awaiting_input') => Response.json({ errorCode: 'conflict', subCode }, { status: 409 });
const waiting = (name = 'request_form') => Response.json({ data: { state: 'awaiting_input', pendingApproval: { requestId: 'input', actions: [{ name, args: {} }] } } });
const completed = () => new Response('data: {"type":"run_started"}\n\ndata: {"type":"run_completed"}\n\ndata: {"type":"done"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
async function collect(stream: ReturnType<typeof streamChatWithInputRecovery>) {
  const result = [];
  for await (const event of stream) result.push(event);
  return result;
}

test('a new text turn supersedes only input cards and preserves history, resume, scope and model config', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const responses = [conflict(), waiting(), completed()];
  const requests: Array<{ url: string; body?: ChatStreamParams }> = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const response = responses.shift();
    assert.ok(response, 'unexpected extra request');
    return response;
  };
  const replaced: string[] = [];
  const result = await collect(streamChatWithInputRecovery(params, async (requestId) => { replaced.push(requestId); return 'continued'; }));
  assert.deepEqual(replaced, ['input']);
  assert.deepEqual(result.map((event) => event.type), ['run_started', 'run_completed', 'done']);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2].body, { ...params, sessionId: 'continued', mode: 'general' });
  assert.ok(requests[1].url.endsWith('?sessionId=paused'));
});

test('normal replies do not inspect or replace the session', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return completed(); };
  await collect(streamChatWithInputRecovery(params, async () => { throw new Error('must not replace'); }));
  assert.equal(calls, 1);
});

test('an uploaded resume survives superseding an old intake form', async (t) => {
  const attachments = [{ id: 'word-source', name: '已有简历.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sourceUrl: 'https://files.example/resume.docx' }];
  const requests: ChatStreamParams[] = [];
  const responses = [conflict(), waiting(), completed()];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body) requests.push(JSON.parse(String(init.body)));
    const response = responses.shift();
    assert.ok(response);
    return response;
  });
  await collect(streamChatWithInputRecovery({ ...params, attachments }, async () => 'with-upload'));
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].attachments, attachments);
  assert.deepEqual(requests[1].attachments, attachments);
  assert.equal(requests[1].sessionId, 'with-upload');
});

test('busy sessions, sensitive approvals and repeated conflicts are never bypassed or looped', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  for (const scenario of [
    { responses: [conflict('session_busy')], replacements: 0 },
    { responses: [conflict(), waiting('read_resume')], replacements: 0 },
    { responses: [conflict(), waiting(), conflict()], replacements: 1 },
  ]) {
    let replaced = 0;
    const responses = [...scenario.responses];
    globalThis.fetch = async () => { const response = responses.shift(); assert.ok(response, 'unexpected retry'); return response; };
    await assert.rejects(collect(streamChatWithInputRecovery(params, async () => { replaced++; return 'continued'; })), AgentRequestError);
    assert.equal(replaced, scenario.replacements);
    assert.equal(responses.length, 0);
  }
});

test('stopping during state recovery does not open a new session', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls === 1) return conflict();
    controller.abort();
    return waiting();
  };
  await assert.rejects(collect(streamChatWithInputRecovery({ ...params, signal: controller.signal }, async () => { throw new Error('must not replace'); })), { name: 'AbortError' });
  assert.equal(calls, 2);
});

test('input and busy conflicts use session-specific copy in both languages', () => {
  for (const locale of [zh, en]) {
    for (const [subCode, key] of [['session_awaiting_input', 'awaitingInput'], ['session_busy', 'sessionBusy'], ['design_context_missing', 'designContextMissing'], ['design_source_changed', 'designSourceChanged'], ['design_canvas_unavailable', 'designCanvasUnavailable'], ['model_response_empty', 'modelResponseEmpty'], ['assessment_invalid_json', 'assessmentIncomplete'], ['assessment_invalid_fields', 'assessmentIncomplete'], ['assessment_budget_exhausted', 'assessmentBudgetExhausted'], ['model_timeout', 'modelTimeout'], ['model_unavailable', 'modelCallFailed']] as const) {
      const title = appErrorCopy({ errorCode: 'conflict', subCode, source: 'bff', retryable: false }, (path) => path === `aiLab.chat.${key}` ? locale.aiLab.chat[key] : 'generic conflict').title;
      assert.equal(title, locale.aiLab.chat[key]);
      assert.notEqual(title, 'generic conflict');
    }
  }
});
