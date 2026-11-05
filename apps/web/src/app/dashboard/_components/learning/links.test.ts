import assert from 'node:assert/strict';
import test from 'node:test';
import { learningHref, scopeLearningHref } from './links';

test('course hyperlinks preserve the exact lesson and originating resume', () => {
  const href = learningHref('rag-advanced', 'resume / 中文', 'RAG 评测');
  const url = new URL(href, 'https://test.invalid');
  assert.equal(url.pathname, '/dashboard/learning');
  assert.equal(url.searchParams.get('lesson'), 'rag-advanced');
  assert.equal(url.searchParams.get('resumeId'), 'resume / 中文');
  assert.equal(url.searchParams.get('q'), 'RAG 评测');
  assert.equal(
    scopeLearningHref('/dashboard/learning?lesson=10-8#course', 'chat-1'),
    '/dashboard/learning?lesson=10-8&resumeId=chat-1#course',
  );
});

test('chat only scopes links to the exact local learning page', () => {
  for (const href of [
    undefined,
    'https://example.com/dashboard/learning',
    '/dashboard/learning-other',
    '//example.com/dashboard/learning',
    'javascript:alert(1)',
    '/dashboard',
  ])
    assert.equal(scopeLearningHref(href, 'chat-1'), href);
});

test('historical upstream course links now open the built-in lesson', () => {
  assert.equal(
    scopeLearningHref(
      'https://xueai.miyang.cn/slides/learn.html#10-8.html',
      'chat-1',
    ),
    '/dashboard/learning?lesson=10-8&resumeId=chat-1',
  );
  assert.equal(
    scopeLearningHref('https://xueai.app/slides/taste-4.html', 'chat-1'),
    '/dashboard/learning?lesson=taste-4&resumeId=chat-1',
  );
  assert.equal(
    scopeLearningHref('https://xueai.miyang.cn/slides/home.html', 'chat-1'),
    '/dashboard/learning?view=courses&resumeId=chat-1',
  );
});
