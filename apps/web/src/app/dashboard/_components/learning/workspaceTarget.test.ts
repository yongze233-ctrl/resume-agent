import assert from 'node:assert/strict';
import test from 'node:test';
import { learningTarget, jobTarget } from './workspaceTarget';
import { stageWidthOf } from '../../edit/_components/ai/lib/stageIntent';

test('workspace links select local resources without carrying another resume context', () => {
  assert.deepEqual(
    learningTarget(
      '/dashboard/learning?lesson=10-8&resumeId=another-chat&q=RAG',
    ),
    { view: 'courses', lessonId: '10-8', query: 'RAG' },
  );
  assert.equal(
    learningTarget('/dashboard/learning?view=practice')?.view,
    'practice',
  );
  for (const href of [
    'https://example.com/dashboard/learning',
    '//example.com/dashboard/learning',
    '/dashboard/learning-other',
    '/dashboard/learning?lesson=../../private',
  ])
    assert.equal(learningTarget(href), null);
});

test('supported employer links open job details; spoofed or unrelated sites stay ordinary links', () => {
  assert.equal(
    jobTarget(
      'https://careers.tencent.com/jobdesc.html?postId=123&utm_source=chat',
      '产品经理',
    )?.job?.url,
    'https://careers.tencent.com/jobdesc.html?postId=123',
  );
  assert.ok(
    jobTarget(
      'https://jobs.ashbyhq.com/openai/fc38c6bf-5330-435c-99b6-1bcf1f5829a8',
      'Product Manager',
    ),
  );
  assert.ok(
    jobTarget(
      'https://job-boards.greenhouse.io/anthropic/jobs/123',
      'Product Manager',
    ),
  );
  for (const href of [
    'https://careers.tencent.com.evil.example/jobdesc.html?postId=123',
    'https://example.com/jobs/123',
    'https://jobs.ashbyhq.com/other-company/123',
    'http://careers.tencent.com/jobdesc.html?postId=123',
    'https://user@careers.tencent.com/jobdesc.html?postId=123',
  ])
    assert.equal(jobTarget(href, '岗位'), null);
});

test('resources share the design workspace width and take over on narrow screens', () => {
  assert.equal(
    stageWidthOf({ kind: 'resources' }),
    stageWidthOf({ kind: 'design' }),
  );
  assert.equal(stageWidthOf({ kind: 'resources' }, true), '100%');
});
