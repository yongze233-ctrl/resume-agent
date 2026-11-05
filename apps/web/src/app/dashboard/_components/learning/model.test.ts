import assert from 'node:assert/strict';
import test from 'node:test';
import { curriculum, matchLearningAbilities, questionsFor } from './model';

test('course recommendations distinguish English word boundaries and support Chinese requirements', () => {
  assert.equal(matchLearningAbilities('Improve storage performance').some((ability) => ability.id === 'rag'), false);
  const matched = matchLearningAbilities('知识库检索、向量检索和评测体系');
  assert.ok(matched.some((ability) => ability.id === 'rag'));
  assert.ok(matched.some((ability) => ability.id === 'eval'));
  assert.equal(matchLearningAbilities('').length, 0);
});

test('imported questions have valid choices and no ambiguous boolean answer indices', () => {
  assert.equal(new Set(curriculum.questions.map((question) => question.id)).size, curriculum.questions.length);
  for (const question of curriculum.questions) {
    assert.ok(question.options.length >= 2);
    assert.ok(question.answers.length > 0);
    assert.ok(question.answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer < question.options.length), question.id);
  }
});

test('ability recommendations and quizzes retain traceable lesson links', () => {
  const lessons = new Set(curriculum.lessons.map((lesson) => lesson.file));
  assert.equal(lessons.size, curriculum.lessons.length);
  for (const ability of curriculum.abilities) {
    assert.ok(ability.lessons.every((file) => lessons.has(file)));
    assert.ok(questionsFor(ability).every((question) => question.lessonFile && ability.lessons.includes(question.lessonFile)));
  }
});
