'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from '@magic-resume-kit/icons';
import { curriculum, type Lesson } from './model';
import { useLearningProgress } from './progress';
import { examQuestions } from './quiz';
import LearningQuiz from './LearningQuiz';
import SkillLibrary from './SkillLibrary';
import styles from './learning-tools.module.css';
import { learningHref } from './links';

export default function CourseReader({
  lesson,
  onClose,
  onNavigate,
  onView,
  onAsk,
  embedded = false,
  resumeId,
}: {
  lesson: Lesson;
  onClose: () => void;
  onNavigate: (lesson: Lesson) => void;
  onView: (view: string) => void;
  onAsk: (text: string) => void;
  embedded?: boolean;
  resumeId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<'read' | 'practice' | 'notes' | 'skills'>(
    'read',
  );
  const [outlineSearch, setOutlineSearch] = useState('');
  const [reference, setReference] = useState('');
  const [shared, setShared] = useState(false);
  const completed = useLearningProgress((state) => state.completed);
  const bookmarks = useLearningProgress((state) => state.bookmarks);
  const notes = useLearningProgress((state) => state.notes);
  const markRead = useLearningProgress((state) => state.markRead);
  const bookmark = useLearningProgress((state) => state.bookmark);
  const saveNote = useLearningProgress((state) => state.saveNote);
  const nativeExam = /^exam(?:-|$)/.test(lesson.id);
  const [examSet] = useState(() =>
    lesson.id === 'exam-all'
      ? examQuestions()
      : curriculum.questions.filter(
          (question) =>
            !/^exam-[1-7]$/.test(lesson.id) ||
            question.part === Number(lesson.id.split('-')[1]),
        ),
  );
  const questions = curriculum.questions.filter(
    (question) => question.lessonFile === lesson.file,
  );
  const topicLessons = curriculum.lessons.filter(
    (item) => item.topic === lesson.topic && !/^exam(?:-|$)/.test(item.id),
  );
  const outline = curriculum.lessons.filter((item) =>
    outlineSearch
      ? `${item.title} ${item.topic}`
          .toLowerCase()
          .includes(outlineSearch.toLowerCase())
      : item.part === lesson.part,
  );
  const groups = useMemo(
    () => [...new Set(outline.map((item) => item.topic))],
    [outline],
  );
  const position = curriculum.lessons.findIndex(
    (item) => item.id === lesson.id,
  );
  const next = curriculum.lessons[position + 1],
    previous = curriculum.lessons[position - 1];
  const lessonSkills = curriculum.skills.filter((skill) =>
    skill.lessonIds.includes(lesson.id),
  );
  useEffect(() => {
    if (!embedded && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [embedded]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.scope !== 'resume-learning'
      )
        return;
      const message = event.data;
      if (message.type === 'close') onClose();
      if (message.type === 'navigate') {
        const target = curriculum.lessons.find(
          (item) => item.id === message.targetLesson,
        );
        if (target) onNavigate(target);
        else if (['courses', 'practice', 'paths'].includes(message.view))
          onView(message.view);
      }
      if (message.type === 'reference' && typeof message.url === 'string') {
        try {
          const url = new URL(message.url);
          if (
            url.protocol === 'https:' &&
            !/(?:^|\.)(?:miyang\.cn|xueai\.app)$/.test(url.hostname)
          )
            setReference(url.toString());
        } catch {
          /* Ignore invalid source links. */
        }
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onClose, onNavigate, onView]);
  const goToFile = (file: string) => {
    const target = curriculum.lessons.find((item) => item.file === file);
    if (target) onNavigate(target);
  };
  const ReaderRoot = embedded ? 'section' : 'dialog';
  return (
    <ReaderRoot
      ref={embedded ? undefined : dialog}
      role={embedded ? 'region' : undefined}
      className={`${styles.readerDialog} ${embedded ? styles.embeddedReader : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="course-title"
    >
      <header className={styles.readerHeader}>
        <div>
          <span>
            {lesson.part} / {lesson.topic}
          </span>
          <h2 id="course-title">{lesson.title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭课程阅读">
          <X size={21} />
        </button>
      </header>
      <div className={styles.readerBody}>
        <aside className={styles.outline} aria-label="完整课程目录">
          <label>
            课程目录
            <input
              aria-label="搜索完整课程目录"
              placeholder="找一节课…"
              value={outlineSearch}
              onChange={(event) => setOutlineSearch(event.target.value)}
            />
          </label>
          <p>
            {outlineSearch
              ? `${outline.length} 个搜索结果`
              : `${lesson.part} · ${outline.length} 节`}
          </p>
          <nav>
            {groups.map((topic) => (
              <div key={topic}>
                <strong>{topic}</strong>
                {outline
                  .filter((item) => item.topic === topic)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={item.id === lesson.id ? 'page' : undefined}
                      onClick={() => onNavigate(item)}
                    >
                      <span>{completed[item.id] ? '✓' : '·'}</span>
                      {item.title}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <footer>
            课程内容：洛小山 / 米羊科技
            <br />
            学习工具由 Resume Agent 实现
          </footer>
        </aside>
        <main className={styles.readerMain}>
          <div className={styles.readerToolbar}>
            <nav aria-label="课程工具">
              {(
                [
                  ['read', nativeExam ? '本章测试' : '课件与演示'],
                  [
                    'practice',
                    `课后练习${questions.length ? ` ${questions.length}` : ''}`,
                  ],
                  ['notes', '我的笔记'],
                  ['skills', '实践 Skill'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <button
              type="button"
              aria-pressed={bookmarks.includes(lesson.id)}
              onClick={() => bookmark(lesson.id)}
            >
              {bookmarks.includes(lesson.id) ? '已收藏' : '收藏本课'}
            </button>
          </div>
          {tab === 'read' &&
            (nativeExam ? (
              <div className={styles.readerScroll}>
                <LearningQuiz questions={examSet} exam onLesson={goToFile} />
              </div>
            ) : (
              <iframe
                ref={frame}
                title={lesson.title}
                src={`/learning/xueai/${lesson.file}`}
                sandbox="allow-scripts allow-downloads"
                referrerPolicy="no-referrer"
              />
            ))}
          {tab === 'practice' && (
            <div className={styles.readerScroll}>
              <LearningQuiz
                key={lesson.id}
                questions={questions}
                onLesson={goToFile}
              />
              <div className={styles.practiceInvite}>
                <h3>把这节课用到一个实际问题里</h3>
                <p>
                  让 AI 根据课程原文出一道实践任务，讨论你的思路与验证方法。
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() =>
                    onAsk(
                      `我正在学习「${lesson.title}」（课程 ID：${lesson.id}）。请先读取本课内容，基于课程给我一道实践题；先让我独立作答，再给反馈，不要直接给出答案。`,
                    )
                  }
                >
                  让 AI 带我练习
                </button>
              </div>
            </div>
          )}
          {tab === 'notes' && (
            <div className={styles.readerScroll}>
              <div className={styles.noteEditor}>
                <span>{lesson.title}</span>
                <h3>记下你自己的理解。</h3>
                <p>疑问、例子和实践结果，都可以留在这里。</p>
                <label htmlFor="lesson-note">本课笔记</label>
                <textarea
                  id="lesson-note"
                  value={notes[lesson.id] ?? ''}
                  maxLength={20000}
                  onChange={(event) => saveNote(lesson.id, event.target.value)}
                  placeholder="这节课解释了什么？我可以把它用在哪里？"
                />
                <small>自动保存在当前浏览器</small>
              </div>
            </div>
          )}
          {tab === 'skills' && (
            <div className={styles.readerScroll}>
              <SkillLibrary
                skills={lessonSkills.length ? lessonSkills : curriculum.skills}
                onAsk={onAsk}
              />
            </div>
          )}
          {reference && (
            <div className={styles.reference}>
              引用资料：
              <a href={reference} target="_blank" rel="noopener noreferrer">
                打开原始研究或文档
              </a>
              <button type="button" onClick={() => setReference('')}>
                收起
              </button>
            </div>
          )}
          <footer className={styles.readerFooter}>
            <div>
              <button
                type="button"
                disabled={!previous}
                onClick={() => previous && onNavigate(previous)}
              >
                上一节
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      new URL(
                        learningHref(
                          lesson.id,
                          resumeId ??
                            new URL(location.href).searchParams.get(
                              'resumeId',
                            ) ??
                            undefined,
                        ),
                        location.href,
                      ).href,
                    )
                    .then(() => setShared(true))
                    .catch(() => setShared(false));
                }}
              >
                {shared ? '链接已复制' : '复制课程链接'}
              </button>
            </div>
            <span>
              {completed[lesson.id]
                ? '已完成阅读'
                : `${topicLessons.length} 节同主题课程`}
            </span>
            <div>
              <button
                type="button"
                onClick={() =>
                  onAsk(
                    `我正在学习「${lesson.title}」（课程 ID：${lesson.id}）。请读取本课内容，结合我的求职方向，解释核心概念并给一个具体例子。`,
                  )
                }
              >
                问 AI
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  markRead(lesson.id);
                  if (next) onNavigate(next);
                }}
              >
                {next ? '完成并继续' : '标记已读'}
              </button>
            </div>
          </footer>
        </main>
      </div>
    </ReaderRoot>
  );
}
