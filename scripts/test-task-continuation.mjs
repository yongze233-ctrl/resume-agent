// Reproduce a failed stream after a partially completed plan in an isolated browser.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const repo = process.cwd(), require = createRequire(resolve(repo, 'apps/agent/package.json'));
const { chromium } = require('playwright');
const output = resolve(repo, '../evaluation/task-continuation'); await mkdir(output, { recursive: true });
const translations = JSON.parse(await readFile(resolve(repo, 'apps/web/src/locales/zh/translation.json'), 'utf8'));
const errorCopy = translations.aiLab.chat.modelResponseEmpty;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1450, height: 1000 } });
const page = await context.newPage(); page.setDefaultTimeout(20000);
const requests = [], checks = [], errors = []; let mode = 'failure';
page.on('pageerror', error => errors.push(error.name));
await context.route('**/api/local-model-setup', route => route.fulfill({ status: 204 }));
await context.route('**/api/site-model', route => route.fulfill({ status: 200, json: { provider: 'agnes-token-plan', model: 'agnes-3.0-flash', baseUrl: 'https://apihub.agnes-ai.com/v1', maxTokens: 16384 } }));
await context.route('**/api/chat-agent/session?*', route => route.fulfill({ status: 200, json: { data: { state: 'active', checkpointId: 'test-checkpoint' } } }));
const todos = [{ content: '检查现有画布', status: 'completed' }, { content: '完成原生排版', status: 'completed' }, { content: '检查溢出并导出', status: 'in_progress' }];
await context.route('**/api/chat-agent', async route => {
  const body = route.request().postDataJSON(); requests.push(body);
  const events = mode === 'success'
    ? [{ type: 'run_started' }, { type: 'plan_update', payload: { todos: todos.map(todo => ({ ...todo, status: 'completed' })) } }, { type: 'message_chunk', content: '已从当前进度继续，剩余检查已完成。' }, { type: 'run_completed' }, { type: 'done' }]
    : [{ type: 'run_started' }, { type: 'llm_started', payload: { requestId: 'first-step' } }, { type: 'plan_update', payload: { todos } }, { type: 'message_chunk', content: mode === 'partial' ? '第一阶段结果已保留。' : '\n\n' }, { type: 'tool_started', payload: { toolName: 'openpencil_inspect', toolCallId: 'read-current-frame' } }, { type: 'tool_completed', payload: { toolName: 'openpencil_inspect', toolCallId: 'read-current-frame' } }, { type: 'llm_started', payload: { requestId: 'empty-step' } }, { type: 'run_recovery', payload: { reason: 'empty_response', attempt: 1, limit: 1 } }, { type: 'error', payload: { errorCode: 'upstream_unavailable', subCode: 'model_response_empty', retryable: true } }, { type: 'done' }];
  await route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') });
});
try {
  await page.goto('http://127.0.0.1:3000/dashboard'); await page.locator('textarea').fill('请检查并导出这份简历'); await page.getByRole('button', { name: '发送', exact: true }).click(); await page.waitForURL(/\/dashboard\/chat\//);
  await page.getByRole('button', { name: '继续任务', exact: true }).waitFor();
  await page.getByText('任务已暂停 · 剩余 1 项', { exact: true }).first().waitFor();
  assert.equal(await page.locator('.agent-progress-overall-ring').count(), 0);
  assert.equal(await page.locator('.agent-progress-row.is-active').count(), 0);
  assert.ok((await page.locator('[data-agent-chat]').innerText()).includes(errorCopy));
  checks.push('whitespace replies cannot hide an error; a paused plan has no active spinner');
  await page.screenshot({ path: resolve(output, '01-paused-with-reason.png') });
  await page.reload(); await page.getByRole('button', { name: '继续任务', exact: true }).waitFor();
  assert.equal(await page.locator('.agent-progress-overall-ring').count(), 0); checks.push('reload preserves unfinished progress and a continuation entry');
  mode = 'success'; await page.getByRole('button', { name: '继续任务', exact: true }).click(); await page.getByText('已从当前进度继续，剩余检查已完成。', { exact: true }).waitFor();
  assert.equal(requests.length, 2); assert.equal(requests[0].sessionId, requests[1].sessionId); assert.equal(requests[0].resumeId, requests[1].resumeId);
  assert.match(requests[1].messages.at(-1).content, /当前画布|current canvas/); assert.equal(await page.getByRole('button', { name: '继续任务', exact: true }).count(), 0);
  assert.equal(await page.locator('[data-from="plan"]').count(), 1, 'Continuing must update the original task card');
  checks.push('continue reuses the session and resume without regenerating completed operations');
  mode = 'partial'; await page.getByRole('button', { name: '新对话', exact: true }).click(); await page.waitForURL('http://127.0.0.1:3000/dashboard'); await page.locator('textarea').fill('保留局部结果并展示错误'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '继续任务', exact: true }).waitFor();
  await page.waitForURL(/\/dashboard\/chat\//);
  await page.waitForFunction(async ({ resumeId, errorCopy }) => {
    const db = await new Promise(resolve => { const request = indexedDB.open('MagicResumeDB', 1); request.onsuccess = () => resolve(request.result); });
    const session = await new Promise(resolve => { const request = db.transaction('MagicResumeStore').objectStore('MagicResumeStore').get('ai-session:' + resumeId); request.onsuccess = () => resolve(request.result); }); db.close();
    return session?.messages.some(message => message.role === 'assistant' && message.content?.includes('第一阶段结果已保留。') && message.content.includes(errorCopy) && message.timeline?.filter(beat => beat.kind === 'text' && beat.text.includes('第一阶段结果已保留。')).length === 1);
  }, { resumeId: page.url().split('/').at(-1), errorCopy });
  const thread = await page.locator('[data-agent-chat]').innerText(); assert.ok(thread.includes(errorCopy)); checks.push('sealed partial text is preserved once in the transcript and the failure remains visible');
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, checks, errors, requests: requests.map(body => ({ sessionId: body.sessionId, resumeId: body.resumeId, source: body.config.source })) }, null, 2)); console.log(JSON.stringify({ passed: true, checks }));
} catch (error) { await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {}); await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: false, checks, errors, error: error.message }, null, 2)); throw error; }
finally { await browser.close(); }
