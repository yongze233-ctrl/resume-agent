'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, FileText, RefreshCw } from '@magic-resume-kit/icons';
import { useResumeDocumentStore } from '@/store/resume/document';
import { useAgentEntryStore } from '@/store/useAgentEntryStore';
import { curriculum, matchLearningAbilities, type Lesson } from './model';
import { learningHref } from './links';
import CourseReader from './CourseReader';
import LearningCenter, { type LearningView } from './LearningCenter';
import styles from './resource-hub.module.css';

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  checkedAt: string;
  matchedTerms: string[];
}
interface JobsResult {
  status: 'ok' | 'unavailable';
  jobs: Job[];
  sources: Array<{ company: string; status: string; checkedAt: string }>;
}
const DEFAULT_QUERY = 'AI 产品经理 RAG Agent 评测';
type HubTab = 'all' | 'jobs' | LearningView;
const learningViews = ['courses', 'practice', 'paths', 'records', 'skills'];
const hubViews = ['all', 'jobs', ...learningViews];

export default function ResourceHub() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const resumes = useResumeDocumentStore((state) => state.resumes);
  const createResume = useResumeDocumentStore((state) => state.createResume);
  const [query, setQuery] = useState(params.get('q') || DEFAULT_QUERY);
  const [applied, setApplied] = useState(params.get('q') || DEFAULT_QUERY);
  const [tab, setTab] = useState<HubTab>(() =>
    hubViews.includes(params.get('view') ?? '')
      ? (params.get('view') as HubTab)
      : 'all',
  );
  const [selectedResume, setSelectedResume] = useState(
    params.get('resumeId') || '',
  );
  const [jobs, setJobs] = useState<JobsResult | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [openingChat, setOpeningChat] = useState(false);
  const [chatError, setChatError] = useState(false);
  const actualResume =
    resumes.find((resume) => resume.id === selectedResume) ?? resumes[0];
  const resumeId = actualResume?.id;
  const related = useMemo(() => matchLearningAbilities(applied), [applied]);
  const courses = useMemo(() => {
    const topics = new Map(
      related.flatMap((ability) =>
        ability.lessons.map((file) => [file, ability.hits.length] as const),
      ),
    );
    const terms = applied
      .toLowerCase()
      .split(/[\s/，、]+/)
      .filter((term) => term.length > 1);
    return curriculum.lessons
      .map((lesson) => ({
        lesson,
        rank:
          (topics.get(lesson.file) ?? 0) +
          terms.filter((term) =>
            `${lesson.title} ${lesson.topic}`.toLowerCase().includes(term),
          ).length *
            3,
      }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 4)
      .map((item) => item.lesson);
  }, [related, applied]);
  const lessonId = params.get('lesson');
  const reader = curriculum.lessons.find((lesson) => lesson.id === lessonId);
  const closeReader = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete('lesson');
    router.replace(`/dashboard/learning${next.size ? `?${next}` : ''}`, {
      scroll: false,
    });
  }, [params, router]);
  const navigateLesson = useCallback(
    (lesson: Lesson) => {
      const next = new URLSearchParams(params.toString());
      next.set('lesson', lesson.id);
      if (resumeId) next.set('resumeId', resumeId);
      router.replace(`/dashboard/learning?${next}`, { scroll: false });
    },
    [params, resumeId, router],
  );
  const openView = (view: string) => {
    if (!hubViews.includes(view)) return;
    setTab(view as HubTab);
    const next = new URLSearchParams(params.toString());
    next.delete('lesson');
    next.set('view', view);
    router.replace(`/dashboard/learning?${next}`, { scroll: false });
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/career/jobs?q=${encodeURIComponent(applied)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('jobs_unavailable');
        const result = (await response.json()) as JobsResult;
        if (!controller.signal.aborted) setJobs(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setJobs({ status: 'unavailable', jobs: [], sources: [] });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingJobs(false);
      });
    return () => controller.abort();
  }, [applied, refresh]);

  const search = (value: string) => {
    const next = value.trim().slice(0, 300);
    if (next) {
      setLoadingJobs(true);
      setQuery(next);
      setApplied(next);
      setRefresh((previous) => previous + 1);
    }
  };
  const openLesson = (
    event: React.MouseEvent<HTMLAnchorElement>,
    lesson: Lesson,
  ) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    navigateLesson(lesson);
  };
  const askAi = async (text?: string) => {
    if (openingChat) return;
    setOpeningChat(true);
    setChatError(false);
    try {
      const id = resumeId ?? (await createResume('岗位与学习推荐'));
      useAgentEntryStore.getState().queue(id, {
        text:
          text ??
          `请结合我的简历和当前对话，为我推荐「${applied}」方向的学习课程和相关岗位。请给出可点击的链接和推荐原因；岗位注明公司、地点与信息核对时间。`,
      });
      router.push(`/dashboard/chat/${encodeURIComponent(id)}`);
    } catch {
      setOpeningChat(false);
      setChatError(true);
    }
  };

  return (
    <section className={styles.page} aria-label="学习与岗位发现">
      <header className={styles.header}>
        <div>
          <span className={styles.headerDot} />
          学习与机会<span className={styles.headerDivider}>/</span>
          <span className={styles.headerSub}>与你的 AI 对话相连</span>
        </div>
        <Link
          href={
            resumeId
              ? `/dashboard/chat/${encodeURIComponent(resumeId)}`
              : '/dashboard'
          }
        >
          返回对话 <ArrowUpRight size={14} />
        </Link>
      </header>
      <div className={styles.scroll}>
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>从一份简历，走向下一份机会</span>
            <h1>
              知道下一步学什么，
              <br />
              也看见下一站去哪里。
            </h1>
            <p>把岗位要求变成学习方向，让课程、实践和真实机会连成一条路。</p>
            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.aiButton}
                onClick={() => {
                  void askAi();
                }}
                disabled={openingChat}
              >
                <span className={styles.aiGlyph} aria-hidden="true">
                  ✦
                </span>
                {openingChat ? '正在回到对话…' : '让 AI 帮我选课程与岗位'}
                <ArrowUpRight size={16} />
              </button>
              <label className={styles.resumeSelect}>
                <FileText size={13} />
                <select
                  aria-label="关联简历"
                  value={actualResume?.id ?? ''}
                  onChange={(event) => setSelectedResume(event.target.value)}
                >
                  {!resumes.length && <option value="">从新对话开始</option>}
                  {resumes.map((resume) => (
                    <option value={resume.id} key={resume.id}>
                      {resume.name || '未命名简历'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {chatError && <p role="alert">未能打开对话，点击重试即可。</p>}
          </div>
          <div className={styles.map} aria-label="从学习走向岗位的能力路线">
            <div className={styles.mapGrid} />
            <svg viewBox="0 0 420 230" fill="none" aria-hidden="true">
              <path
                d="M45 166C128 166 119 69 205 69S295 126 372 55"
                stroke="#8ba8dd"
                strokeWidth="1.5"
              />
              <path
                d="M45 166C153 166 218 204 372 55"
                stroke="#c7d4e7"
                strokeDasharray="4 6"
              />
            </svg>
            <span className={styles.mapLabel}>从一节课，连接到一个机会</span>
            <a
              className={`${styles.mapNode} ${styles.nodeOne}`}
              href={learningHref('1-2-mitigation-rag', resumeId, applied)}
              onClick={(event) =>
                openLesson(
                  event,
                  curriculum.lessons.find(
                    (lesson) => lesson.id === '1-2-mitigation-rag',
                  )!,
                )
              }
            >
              <span>先建立理解</span>
              <strong>RAG 检索增强</strong>
              <ArrowUpRight size={13} />
            </a>
            <a
              className={`${styles.mapNode} ${styles.nodeTwo}`}
              href={learningHref('10-8', resumeId, applied)}
              onClick={(event) =>
                openLesson(
                  event,
                  curriculum.lessons.find((lesson) => lesson.id === '10-8')!,
                )
              }
            >
              <span>再验证效果</span>
              <strong>Agent 评测</strong>
              <ArrowUpRight size={13} />
            </a>
            <button
              className={`${styles.mapNode} ${styles.nodeThree}`}
              type="button"
              onClick={() => openView('jobs')}
            >
              <span>连接真实机会</span>
              <strong>AI 产品经理</strong>
              <ArrowUpRight size={13} />
            </button>
            <span className={styles.mapFoot}>课程 → 能力线索 → 岗位机会</span>
          </div>
        </div>
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            search(query);
          }}
        >
          <span className={styles.searchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            aria-label="搜索课程与岗位"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入想补的能力，或一个目标岗位…"
          />
          <button type="submit">
            查找课程与岗位 <ArrowUpRight size={15} />
          </button>
        </form>
        <div className={styles.interests}>
          <span>可以从这里开始</span>
          {['RAG', 'Agent', 'AI 产品经理', '上下文工程', '评测'].map(
            (label) => (
              <button key={label} type="button" onClick={() => search(label)}>
                {label}
              </button>
            ),
          )}
        </div>
        <div className={styles.contentHeader}>
          <nav aria-label="资源类型">
            {(
              [
                ['all', '为你发现'],
                ['courses', '学习课程'],
                ['paths', '学习路线'],
                ['practice', '练习与测试'],
                ['skills', '实践 Skill'],
                ['records', '学习记录'],
                ['jobs', '相关岗位'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => openView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <span>按主题关联 · 个人匹配度由 AI 结合经历核实</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className={styles.results}
          >
            {learningViews.includes(tab) && (
              <LearningCenter
                key={tab}
                view={tab as LearningView}
                resumeId={resumeId}
                onLesson={navigateLesson}
                onAsk={(text) => {
                  void askAi(text);
                }}
              />
            )}
            {tab === 'all' && (
              <section
                className={styles.courseSection}
                aria-labelledby="course-section-title"
              >
                <div className={styles.sectionTitle}>
                  <div>
                    <span className={styles.sectionIcon}>学</span>
                    <div>
                      <h2 id="course-section-title">值得先学的几节课</h2>
                      <p>围绕「{applied}」，从一个具体问题开始。</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => openView('courses')}>
                    浏览全部课程 <ArrowUpRight size={13} />
                  </button>
                </div>
                <div className={styles.courseGrid}>
                  {courses.map((lesson, index) => (
                    <article
                      key={lesson.id}
                      className={`${styles.course} ${index === 0 ? styles.featured : ''}`}
                    >
                      <div className={styles.courseTop}>
                        <span>{lesson.topic}</span>
                        <span>{lesson.tag}</span>
                      </div>
                      <a
                        href={learningHref(lesson.id, resumeId, applied)}
                        onClick={(event) => openLesson(event, lesson)}
                      >
                        <h3>{lesson.title}</h3>
                        <ArrowUpRight size={19} />
                      </a>
                      <p>{lesson.part}</p>
                      <footer>
                        <span>小山学堂 · 原始课程</span>
                        <a
                          href={learningHref(lesson.id, resumeId, applied)}
                          onClick={(event) => openLesson(event, lesson)}
                        >
                          打开课程 <ArrowUpRight size={14} />
                        </a>
                      </footer>
                    </article>
                  ))}
                  {!courses.length && (
                    <p className={styles.empty}>
                      暂时没有找到对应课程，换个能力关键词试试。
                    </p>
                  )}
                </div>
                <div className={styles.catalogNote}>
                  <span>
                    {curriculum.manifest.counts.lessons} 节课程已全部内置
                  </span>
                  <span>
                    需要更具体的学习顺序？
                    <button
                      type="button"
                      onClick={() => {
                        void askAi();
                      }}
                    >
                      让 AI 结合我的方向推荐 <ArrowUpRight size={12} />
                    </button>
                  </span>
                </div>
              </section>
            )}
            {(tab === 'all' || tab === 'jobs') && (
              <section
                className={styles.jobsSection}
                aria-labelledby="jobs-section-title"
              >
                <div className={styles.sectionTitle}>
                  <div>
                    <span
                      className={`${styles.sectionIcon} ${styles.jobSectionIcon}`}
                    >
                      职
                    </span>
                    <div>
                      <h2 id="jobs-section-title">把学习连到真实岗位</h2>
                      <p>来自企业招聘源，点击职位名称查看完整要求。</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadingJobs(true);
                      setRefresh((previous) => previous + 1);
                    }}
                    disabled={loadingJobs}
                  >
                    <RefreshCw size={13} />
                    {loadingJobs ? '正在读取招聘源' : '重新读取'}
                  </button>
                </div>
                <div className={styles.sourceStatus}>
                  {(jobs?.sources.length
                    ? jobs.sources
                    : [
                        {
                          company: '腾讯',
                          status: loadingJobs ? 'loading' : 'unavailable',
                        },
                        {
                          company: 'OpenAI',
                          status: loadingJobs ? 'loading' : 'unavailable',
                        },
                        {
                          company: 'Anthropic',
                          status: loadingJobs ? 'loading' : 'unavailable',
                        },
                      ]
                  ).map((source) => (
                    <span
                      key={source.company}
                      data-unavailable={source.status === 'unavailable'}
                      data-loading={loadingJobs}
                    >
                      <i />
                      {source.company}
                      {loadingJobs
                        ? ' · 读取中'
                        : source.status === 'unavailable'
                          ? ' · 暂未连接'
                          : ''}
                    </span>
                  ))}
                </div>
                {loadingJobs ? (
                  <div
                    className={styles.skeletons}
                    role="status"
                    aria-label="正在读取岗位"
                  >
                    <div />
                    <div />
                    <div />
                  </div>
                ) : jobs?.jobs.length ? (
                  <div className={styles.jobsList}>
                    {jobs.jobs.slice(0, tab === 'jobs' ? 9 : 5).map((job) => (
                      <article className={styles.job} key={job.id}>
                        <span className={styles.companyAvatar}>
                          {job.company === '腾讯'
                            ? 'T'
                            : job.company === 'OpenAI'
                              ? 'O'
                              : 'A'}
                        </span>
                        <div className={styles.jobMain}>
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <h3>{job.title}</h3>
                            <ArrowUpRight size={15} />
                          </a>
                          <p>
                            {job.company}
                            <span>·</span>
                            {job.location}
                          </p>
                          <div className={styles.jobTags}>
                            {job.matchedTerms.slice(0, 4).map((term) => (
                              <span key={term}>{term}</span>
                            ))}
                          </div>
                        </div>
                        <div className={styles.jobMeta}>
                          <span>招聘源已核对</span>
                          <time dateTime={job.checkedAt}>
                            {new Date(job.checkedAt).toLocaleDateString(
                              'zh-CN',
                              { month: 'numeric', day: 'numeric' },
                            )}
                          </time>
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            查看岗位 <ArrowUpRight size={13} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    {jobs?.status === 'unavailable'
                      ? '招聘源暂时没有连接成功，可以稍后重新读取。'
                      : '当前招聘源没有找到相关岗位，试试其他角色或能力关键词。'}
                  </div>
                )}
                <p className={styles.jobNotice}>
                  岗位相关性来自方向与主题关联，资历、地点和当前招聘状态请以企业原页面为准。
                </p>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
        <footer className={styles.pageFooter}>
          <span>学习有出处，机会有来源。</span>
          <span>
            课程内容：小山学堂 / 洛小山 · 米羊科技　
            <a
              href="/learning/xueai/NOTICE.txt"
              target="_blank"
              rel="noreferrer"
            >
              来源与协议
            </a>
          </span>
        </footer>
      </div>
      {reader && (
        <CourseReader
          key={reader.id}
          lesson={reader}
          onClose={closeReader}
          onNavigate={navigateLesson}
          onView={openView}
          onAsk={(text) => {
            void askAi(text);
          }}
        />
      )}
      {lessonId && !reader && (
        <div role="alert" className={styles.invalidLink}>
          这条课程链接暂未收录。
          <button type="button" onClick={closeReader}>
            返回课程列表
          </button>
        </div>
      )}
    </section>
  );
}
