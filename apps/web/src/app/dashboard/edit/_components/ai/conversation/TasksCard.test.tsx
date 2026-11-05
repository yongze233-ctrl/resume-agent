import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import TasksCard from './TasksCard';
import type { ChatMessage } from '../types';

const plan: ChatMessage = {
  id: 'unfinished',
  role: 'plan',
  status: 'done',
  todos: [
    { content: '已经验证的步骤', status: 'completed' },
    { content: '尚未验证的步骤', status: 'in_progress' },
  ],
};
const render = (message: ChatMessage, runActive = false) =>
  renderToStaticMarkup(
    <TasksCard
      message={message}
      runActive={runActive}
      onContinue={() => {}}
      onToggleCanvas={() => {}}
      isCanvasOpen={false}
    />,
  );

test('unfinished historical cards stop animating without marking pending work complete', async () => {
  await i18n.changeLanguage('zh');
  const markup = render({ ...plan, status: 'running' });
  assert.match(markup, /任务已暂停/);
  assert.match(markup, /继续任务/);
  assert.ok(!markup.includes('agent-progress-overall-ring'));
  assert.ok(!markup.includes('agent-progress-row is-active'));
  assert.equal(plan.todos?.[1].status, 'in_progress');
});

test('waiting for information cannot be bypassed with the generic continuation action', () => {
  const markup = render({
    ...plan,
    pauseKind: 'waiting_input',
    pauseReason: '请先填写缺少的信息',
  });
  assert.match(markup, /请先填写缺少的信息/);
  assert.ok(!markup.includes('继续任务'));
});

test('completed cards and live cards never offer a duplicate continuation', () => {
  const completed = render({
    ...plan,
    todos: plan.todos?.map((todo) => ({ ...todo, status: 'completed' })),
  });
  assert.ok(!completed.includes('继续任务'));
  assert.ok(!completed.includes('任务已暂停'));
  const live = render({ ...plan, status: 'running' }, true);
  assert.ok(live.includes('agent-progress-overall-ring'));
  assert.ok(!live.includes('继续任务'));
});
