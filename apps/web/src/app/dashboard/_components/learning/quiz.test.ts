import assert from 'node:assert/strict';
import test from 'node:test';
import { curriculum } from './model';
import { isCorrect, examQuestions } from './quiz';

test('a comprehensive exam has five unique questions from each chapter', () => {
  const questions = examQuestions(() => 0.5);
  assert.equal(questions.length, 35);
  assert.equal(new Set(questions.map((question) => question.id)).size, 35);
  for (let part = 1; part <= 7; part++)
    assert.equal(
      questions.filter((question) => question.part === part).length,
      5,
    );
});
test('multi-answer grading rejects missing, extra and duplicate choices', () => {
  const question = curriculum.questions.find(
    (question) => question.answers.length > 1,
  )!;
  assert.ok(isCorrect(question, [...question.answers].reverse()));
  assert.ok(!isCorrect(question, question.answers.slice(1)));
  assert.ok(!isCorrect(question, [question.answers[0], question.answers[0]]));
  assert.ok(!isCorrect(question, []));
});
