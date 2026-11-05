'use client';
import { useResourceWorkspaceStore } from '@/store/useResourceWorkspaceStore';
import { curriculum } from './model';
import CourseReader from './CourseReader';
import LearningCenter, { type LearningView } from './LearningCenter';
import JobsWorkspace from './JobsWorkspace';
import type { ResourceView } from './workspaceTarget';
import styles from './resource-workspace.module.css';

const views: Array<[ResourceView, string]> = [
  ['courses', '课程'],
  ['paths', '路线'],
  ['practice', '练习'],
  ['skills', 'Skill'],
  ['records', '学习记录'],
  ['jobs', '岗位'],
];
export default function ResourceWorkspace({
  resumeId,
  onAsk,
  onClose,
}: {
  resumeId: string;
  onAsk: (text: string) => void;
  onClose: () => void;
}) {
  const entry = useResourceWorkspaceStore((state) => state.byResume[resumeId]);
  const open = useResourceWorkspaceStore((state) => state.open);
  if (!entry) return null;
  const { target } = entry;
  const lesson = target.lessonId
    ? curriculum.lessons.find((item) => item.id === target.lessonId)
    : undefined;
  const changeView = (view: string) => {
    if (views.some(([id]) => id === view))
      open(resumeId, { view: view as ResourceView });
  };
  return (
    <section
      className={styles.workspace}
      aria-label="岗位与学习工作区"
      data-resource-workspace
    >
      <header className={styles.header}>
        <div>
          {target.lessonId ? (
            <button
              type="button"
              className={styles.back}
              onClick={() => changeView('courses')}
            >
              ‹ 课程目录
            </button>
          ) : (
            <strong>岗位与学习</strong>
          )}
          <span>和当前对话一起使用</span>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="关闭岗位与学习"
        >
          <span className={styles.closeText}>返回对话</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m5 5 8 8m0-8-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        </button>
      </header>
      {!target.lessonId && (
        <nav className={styles.tabs} aria-label="工作区内容">
          {views.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={target.view === id}
              onClick={() => changeView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className={target.lessonId ? styles.courseBody : styles.content}>
        {target.lessonId ? (
          lesson ? (
            <CourseReader
              key={lesson.id}
              embedded
              resumeId={resumeId}
              lesson={lesson}
              onClose={() => changeView('courses')}
              onNavigate={(next) =>
                open(resumeId, { view: 'courses', lessonId: next.id })
              }
              onView={changeView}
              onAsk={onAsk}
            />
          ) : (
            <div className={styles.empty}>
              <p>这节课程暂未收录。</p>
              <button type="button" onClick={() => changeView('courses')}>
                浏览完整课程
              </button>
            </div>
          )
        ) : target.view === 'jobs' ? (
          <JobsWorkspace
            key={target.job?.url ?? target.query ?? 'browse'}
            selected={target.job}
            query={target.query}
            onSelect={(next) => open(resumeId, next)}
            onAsk={onAsk}
          />
        ) : (
          <LearningCenter
            key={target.view}
            view={target.view as LearningView}
            resumeId={resumeId}
            onLesson={(next) =>
              open(resumeId, { view: 'courses', lessonId: next.id })
            }
            onAsk={onAsk}
          />
        )}
      </div>
    </section>
  );
}
