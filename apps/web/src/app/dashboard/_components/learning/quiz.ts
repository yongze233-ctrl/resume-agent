import { curriculum, type Question } from './model';

export const isCorrect = (question: Question, answers: number[]) =>
  answers.length === question.answers.length &&
  new Set(answers).size === answers.length &&
  answers.every((answer) => question.answers.includes(answer));

/** Each of the seven chapters contributes five questions to the comprehensive exam. */
export function examQuestions(random: () => number = Math.random) {
  const shuffle = <T>(input: T[]) => {
    const items = [...input];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  return shuffle(
    Array.from({ length: 7 }, (_, i) =>
      shuffle(
        curriculum.questions.filter((question) => question.part === i + 1),
      ).slice(0, 5),
    ).flat(),
  );
}
