'use client';
import { useMemo, useState } from 'react';
import {
  curriculum,
  matchLearningAbilities,
  type Lesson,
  type Question,
} from './model';
import { learningHref } from './links';
import { useLearningProgress } from './progress';
import { examQuestions } from './quiz';
import LearningQuiz from './LearningQuiz';
import SkillLibrary from './SkillLibrary';
import styles from './learning-tools.module.css';

export type LearningView =
  'courses' | 'practice' | 'paths' | 'records' | 'skills';
export default function LearningCenter({
  view,
  resumeId,
  onLesson,
  onAsk,
}: {
  view: LearningView;
  resumeId?: string;
  onLesson: (lesson: Lesson) => void;
  onAsk: (text: string) => void;
}) {
  const [search, setSearch] = useState(''),
    [part, setPart] = useState(''),
    [savedOnly, setSavedOnly] = useState(false),
    [limit, setLimit] = useState(40);
  const [mode, setMode] = useState<'chapter' | 'exam' | 'wrong'>('chapter'),
    [chapter, setChapter] = useState(1),
    [round, setRound] = useState(0),
    [exam, setExam] = useState<Question[]>([]),
    [reviewIds, setReviewIds] = useState<string[]>([]),
    [questionLimit, setQuestionLimit] = useState(10);
  const [recordTab, setRecordTab] = useState<'completed' | 'notes' | 'saved'>(
    'completed',
  );
  const [jd, setJd] = useState(''),
    [target, setTarget] = useState('');
  const completed = useLearningProgress((state) => state.completed),
    bookmarks = useLearningProgress((state) => state.bookmarks),
    notes = useLearningProgress((state) => state.notes),
    attempts = useLearningProgress((state) => state.attempts),
    exams = useLearningProgress((state) => state.exams),
    bookmark = useLearningProgress((state) => state.bookmark);
  const parts = [...new Set(curriculum.lessons.map((lesson) => lesson.part))];
  const filtered = curriculum.lessons.filter(
    (lesson) =>
      (!part || lesson.part === part) &&
      (!savedOnly || bookmarks.includes(lesson.id)) &&
      (!search ||
        `${lesson.title} ${lesson.topic} ${lesson.part}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const relevant = useMemo(
    () => (target ? matchLearningAbilities(target) : []),
    [target],
  );
  const paths = target ? relevant : curriculum.abilities;
  const wrongCount = Object.values(attempts).filter(
    (attempt) => !attempt.correct,
  ).length;
  const questions =
    mode === 'exam'
      ? exam
      : mode === 'wrong'
        ? curriculum.questions.filter((question) =>
            reviewIds.includes(question.id),
          )
        : curriculum.questions.filter((question) => question.part === chapter);
  const openFile = (file: string) => {
    const lesson = curriculum.lessons.find((item) => item.file === file);
    if (lesson) onLesson(lesson);
  };
  const courseLink = (lesson: Lesson, extra?: string) => (
    <a
      href={learningHref(lesson.id, resumeId)}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        onLesson(lesson);
      }}
    >
      {lesson.title}
      {extra && <small>{extra}</small>}
    </a>
  );
  const startExam = () => {
    setExam(examQuestions());
    setMode('exam');
    setRound((previous) => previous + 1);
  };
  const exportRecords = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              product: 'Resume Agent',
              exportedAt: new Date().toISOString(),
              completed,
              bookmarks,
              notes,
              attempts,
              exams,
              courseVersion: curriculum.manifest.commit,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = '我的学习记录.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className={styles.workspace} aria-label="本站学习中心">
      {view === 'courses' && (
        <>
          <header>
            <div>
              <h2>完整课程，随时回来接着学。</h2>
              <p>
                {curriculum.lessons.length}{' '}
                节课件已全部内置，交互演示也在本站运行。
              </p>
            </div>
            <span>{Object.keys(completed).length} 节已读</span>
          </header>
          <div className={styles.filters}>
            <input
              aria-label="搜索完整课程"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(40);
              }}
              placeholder="搜索课程、主题或篇章"
            />
            <select
              aria-label="筛选篇章"
              value={part}
              onChange={(event) => {
                setPart(event.target.value);
                setLimit(40);
              }}
            >
              <option value="">全部篇章</option>
              {parts.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={savedOnly}
              onClick={() => {
                setSavedOnly(!savedOnly);
                setLimit(40);
              }}
            >
              只看收藏
            </button>
          </div>
          <p>共 {filtered.length} 节</p>
          <div className={styles.catalogRows}>
            {filtered.slice(0, limit).map((lesson) => (
              <article key={lesson.id}>
                <span>{completed[lesson.id] ? '✓ 已读' : lesson.tag}</span>
                {courseLink(lesson, `${lesson.part} / ${lesson.topic}`)}
                <button
                  type="button"
                  aria-label={`${bookmarks.includes(lesson.id) ? '取消收藏' : '收藏'} ${lesson.title}`}
                  onClick={() => bookmark(lesson.id)}
                >
                  {bookmarks.includes(lesson.id) ? '已收藏' : '收藏'}
                </button>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className={styles.empty}>
              没有找到课程，试试其他关键词或篇章。
            </div>
          )}
          {filtered.length > limit && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={() => setLimit(limit + 40)}
            >
              继续显示课程（剩余 {filtered.length - limit} 节）
            </button>
          )}
        </>
      )}
      {view === 'practice' && (
        <>
          <header>
            <div>
              <h2>练一次，知道自己理解了多少。</h2>
              <p>
                350
                道原始题目，支持章节练习、综合考试和错题复习。解析在提交后显示。
              </p>
            </div>
          </header>
          <div className={styles.practiceModes}>
            <button
              type="button"
              aria-pressed={mode === 'chapter'}
              onClick={() => {
                setMode('chapter');
                setQuestionLimit(10);
              }}
            >
              章节练习
            </button>
            <button
              type="button"
              aria-pressed={mode === 'exam'}
              onClick={startExam}
            >
              综合测试
            </button>
            <button
              type="button"
              aria-pressed={mode === 'wrong'}
              onClick={() => {
                setReviewIds(
                  Object.entries(attempts)
                    .filter(([, attempt]) => !attempt.correct)
                    .map(([id]) => id),
                );
                setMode('wrong');
                setQuestionLimit(10);
              }}
            >
              错题复习 {wrongCount}
            </button>
          </div>
          {mode === 'chapter' && (
            <div className={styles.filters}>
              <label>
                选择章节　
                <select
                  aria-label="练习章节"
                  value={chapter}
                  onChange={(event) => {
                    setChapter(Number(event.target.value));
                    setQuestionLimit(10);
                  }}
                >
                  {Array.from({ length: 7 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      第 {i + 1} 篇 · 50 题
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <LearningQuiz
            key={`${mode}-${chapter}-${round}`}
            questions={
              mode === 'exam' ? questions : questions.slice(0, questionLimit)
            }
            exam={mode === 'exam'}
            onLesson={openFile}
            onRetry={startExam}
          />
          {mode !== 'exam' && questions.length > questionLimit && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={() => setQuestionLimit(questionLimit + 10)}
            >
              继续练习
            </button>
          )}
          {mode === 'wrong' && !questions.length && (
            <p>目前没有待复习的错题。答错的题会自动出现在这里。</p>
          )}
        </>
      )}
      {view === 'paths' && (
        <>
          <header>
            <div>
              <h2>把岗位要求，变成学习路线。</h2>
              <p>先按 JD 找到相关主题，再让 AI 结合你的经历确认学习重点。</p>
            </div>
          </header>
          <form
            className={styles.jdEditor}
            onSubmit={(event) => {
              event.preventDefault();
              setTarget(jd.trim());
            }}
          >
            <label htmlFor="learning-jd">目标岗位 JD</label>
            <textarea
              id="learning-jd"
              value={jd}
              onChange={(event) => setJd(event.target.value)}
              maxLength={12000}
              placeholder="粘贴岗位要求，例如 RAG、Agent 评测、上下文工程…"
            />
            <div>
              <button type="submit" className={styles.primary}>
                匹配相关课程
              </button>
              <button
                type="button"
                onClick={() =>
                  onAsk(
                    `请结合我的简历和这份岗位要求，区分已有经历证据、需要核实的信息与建议补齐的能力，并给出本站课程链接和学习顺序。不要把简历没写等同于不会。\n\n${jd || target}`,
                  )
                }
              >
                让 AI 结合我的简历分析
              </button>
            </div>
          </form>
          {target && (
            <p>找到 {paths.length} 个相关主题；主题关联不代表个人能力判断。</p>
          )}
          <div className={styles.pathList}>
            {paths.map((ability) => (
              <article key={ability.id}>
                <h3>{ability.label}</h3>
                <p>{ability.keywords.slice(0, 5).join(' / ')}</p>
                <nav>
                  {ability.lessons
                    .map((file) =>
                      curriculum.lessons.find((lesson) => lesson.file === file),
                    )
                    .filter((lesson): lesson is Lesson => !!lesson)
                    .map((lesson) => (
                      <span key={lesson.id}>{courseLink(lesson)}</span>
                    ))}
                </nav>
              </article>
            ))}
          </div>
          {!paths.length && (
            <div className={styles.empty}>
              没有直接对应的主题，可以让 AI 帮你拆解岗位要求。
            </div>
          )}
        </>
      )}
      {view === 'skills' && <SkillLibrary onAsk={onAsk} />}
      {view === 'records' && (
        <>
          <header>
            <div>
              <h2>你走过的每一步，都留在这里。</h2>
              <p>课程进度、收藏、笔记和测试记录保存在当前浏览器。</p>
            </div>
            <button
              type="button"
              className={styles.export}
              onClick={exportRecords}
            >
              导出学习记录
            </button>
          </header>
          <div className={styles.progressSummary}>
            <div>
              <strong>{Object.keys(completed).length}</strong>
              <span>已读课程 / {curriculum.lessons.length}</span>
            </div>
            <div>
              <strong>{Object.keys(attempts).length}</strong>
              <span>已练习题目</span>
            </div>
            <div>
              <strong>{exams.length}</strong>
              <span>已完成测试</span>
            </div>
          </div>
          <nav className={styles.sectionTabs} aria-label="学习记录类型">
            {(
              [
                ['completed', '已读课程'],
                ['notes', '课程笔记'],
                ['saved', '我的收藏'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={recordTab === id}
                onClick={() => setRecordTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {recordTab === 'notes' ? (
            <div className={styles.notesList}>
              {curriculum.lessons
                .filter((lesson) => notes[lesson.id]?.trim())
                .map((lesson) => (
                  <article key={lesson.id}>
                    <h3>{lesson.title}</h3>
                    <p>{notes[lesson.id]}</p>
                    {courseLink(lesson)}
                  </article>
                ))}
              {!Object.values(notes).some((note) => note.trim()) && (
                <div className={styles.empty}>
                  在课程阅读器中打开「我的笔记」，记录自己的理解。
                </div>
              )}
            </div>
          ) : (
            <div className={styles.catalogRows}>
              {curriculum.lessons
                .filter((lesson) =>
                  recordTab === 'completed'
                    ? !!completed[lesson.id]
                    : bookmarks.includes(lesson.id),
                )
                .map((lesson) => (
                  <article key={lesson.id}>
                    {courseLink(lesson, lesson.topic)}
                    <span>{completed[lesson.id] ? '已读' : '已收藏'}</span>
                  </article>
                ))}
            </div>
          )}
          {exams.length > 0 && (
            <div className={styles.sessionList}>
              <h3>最近的综合测试</h3>
              {exams
                .slice()
                .reverse()
                .slice(0, 5)
                .map((item) => (
                  <div key={item.id}>
                    <span>
                      {new Date(item.at).toLocaleDateString('zh-CN')} ·{' '}
                      {item.total} 题
                    </span>
                    <strong>
                      {Math.round((item.correct / item.total) * 100)} 分
                    </strong>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
      <p className={styles.sourceCredit}>
        内容来源：小山学堂 · 洛小山 /
        米羊科技。AGPL-3.0；本站内置课程与学习工具。
      </p>
    </section>
  );
}
