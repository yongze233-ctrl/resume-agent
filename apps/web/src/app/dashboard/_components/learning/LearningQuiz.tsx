'use client';
import { useState } from 'react';
import type { Question } from './model';
import { isCorrect } from './quiz';
import { useLearningProgress } from './progress';
import styles from './learning-tools.module.css';

export default function LearningQuiz({
  questions,
  exam = false,
  onLesson,
  onRetry,
}: {
  questions: Question[];
  exam?: boolean;
  onLesson: (file: string) => void;
  onRetry?: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, number[]>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const answer = useLearningProgress((state) => state.answer);
  const finishExam = useLearningProgress((state) => state.finishExam);
  const correctCount = questions.filter((question) =>
    isCorrect(question, selected[question.id] ?? []),
  ).length;
  const submit = (question: Question) => {
    answer(
      question.id,
      selected[question.id] ?? [],
      isCorrect(question, selected[question.id] ?? []),
    );
    setSubmitted((previous) => ({ ...previous, [question.id]: true }));
  };
  const submitExam = () => {
    questions.forEach((question) =>
      answer(
        question.id,
        selected[question.id] ?? [],
        isCorrect(question, selected[question.id] ?? []),
      ),
    );
    finishExam(correctCount, questions.length);
    setFinished(true);
  };
  if (!questions.length)
    return (
      <div className={styles.empty}>
        这节课没有独立题目，可以记录笔记，或让 AI 带你做一次实践。
      </div>
    );
  return (
    <section
      className={styles.quiz}
      aria-label={exam ? '综合测试' : '课程练习'}
    >
      {exam && (
        <header className={styles.examHeader}>
          <div>
            <h3>
              {finished
                ? `本次得分 ${Math.round((correctCount / questions.length) * 100)}`
                : '七章综合测试'}
            </h3>
            <p>
              {finished
                ? `${correctCount} / ${questions.length} 题回答正确，下面可以查看解析和对应课程。`
                : `${questions.length} 道题，交卷后统一判分并展示解析。未作答题目计为未答对。`}
            </p>
          </div>
          {finished && onRetry && (
            <button onClick={onRetry} type="button">
              重新组卷
            </button>
          )}
        </header>
      )}
      {questions.map((question, index) => {
        const choices = selected[question.id] ?? [],
          revealed = exam ? finished : !!submitted[question.id];
        return (
          <article
            key={question.id}
            className={styles.question}
            data-question-id={question.id}
          >
            <span className={styles.questionMeta}>
              {index + 1} / {questions.length}　
              {question.type === 'multi'
                ? '多选题'
                : question.type === 'judge'
                  ? '判断题'
                  : '单选题'}
              　{question.topic}
            </span>
            <h3>{question.question}</h3>
            <div className={styles.options}>
              {question.options.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={revealed}
                  aria-pressed={choices.includes(i)}
                  data-correct={revealed && question.answers.includes(i)}
                  onClick={() =>
                    setSelected((previous) => ({
                      ...previous,
                      [question.id]:
                        question.type === 'multi'
                          ? choices.includes(i)
                            ? choices.filter((item) => item !== i)
                            : [...choices, i]
                          : [i],
                    }))
                  }
                >
                  <b>{String.fromCharCode(65 + i)}</b>
                  {option}
                </button>
              ))}
            </div>
            {!exam && !revealed && (
              <button
                className={styles.primary}
                disabled={!choices.length}
                type="button"
                onClick={() => submit(question)}
              >
                提交答案
              </button>
            )}
            {revealed && (
              <div className={styles.answer} role="status">
                <strong>
                  {isCorrect(question, choices)
                    ? '回答正确'
                    : '这道题需要再看一下'}
                </strong>
                <p>
                  参考答案：
                  {question.answers
                    .map((i) => String.fromCharCode(65 + i))
                    .join('、')}
                </p>
                <p>{question.explanation}</p>
                {question.lessonFile && (
                  <button
                    type="button"
                    onClick={() => onLesson(question.lessonFile!)}
                  >
                    回到对应课程
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
      {exam && !finished && (
        <div className={styles.examSubmit}>
          <span>
            已作答{' '}
            {
              questions.filter((question) => selected[question.id]?.length)
                .length
            }{' '}
            / {questions.length}
          </span>
          <button type="button" className={styles.primary} onClick={submitExam}>
            交卷并查看报告
          </button>
        </div>
      )}
    </section>
  );
}
