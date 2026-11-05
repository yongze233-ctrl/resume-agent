'use client';
import { useState } from 'react';
import type {
  AnalysisImprovementAction,
  EvaluationProgress,
  MultiPersonaResumeAnalysis,
} from '@/types/agent/multi-persona';
import { AnimatedNumber } from './motion/primitives';
import { evaluationCopy } from './copy';
import { reviewActive, REVIEW_PHASES } from './reviewModel';
import type { CanvasAnnotationStatus } from './canvasAnnotations';
import styles from './review-workspace.module.css';
import ReviewTargetPicker, {
  type ReviewWorkspaceControls,
} from './ReviewTargetPicker';

export default function EvaluationScorePanel({
  analysis,
  progress,
  issues,
  running,
  canReview,
  preparing,
  sourceError,
  annotations,
  nativeComments,
  workspace,
  onReview,
  onClose,
  onSelectIssue,
  onRetryAnnotations,
}: {
  analysis: MultiPersonaResumeAnalysis | null;
  progress: EvaluationProgress | null;
  issues: AnalysisImprovementAction[];
  running: boolean;
  canReview: boolean;
  preparing: boolean;
  sourceError: string | null;
  annotations: CanvasAnnotationStatus | null;
  nativeComments: boolean;
  workspace?: ReviewWorkspaceControls;
  onReview: () => void;
  onClose: () => void;
  onSelectIssue: (id: string) => void;
  onRetryAnnotations: () => void;
}) {
  const [index, setIndex] = useState(0);
  const active = reviewActive(progress),
    score = analysis && !active ? Math.round(analysis.overall_score) : null;
  const phase = REVIEW_PHASES.indexOf(
    progress?.phase as (typeof REVIEW_PHASES)[number],
  );
  const interrupted =
    progress?.phase === 'failed' || progress?.phase === 'stopped';
  return (
    <section
      className={styles.report}
      aria-label="简历评估评分"
      data-evaluation-panel
    >
      <header>
        <h2>简历评估</h2>
        <button type="button" onClick={onClose} aria-label="关闭简历评估">
          ×
        </button>
      </header>
      <div className={styles.reportScroll}>
        {workspace && (
          <ReviewTargetPicker
            workspace={workspace}
            busy={running || !!workspace.batch}
            loading={preparing}
          />
        )}
        {sourceError && (
          <p role="alert" className={styles.error}>
            {sourceError}
          </p>
        )}
        <div
          className={styles.score}
          aria-label={score === null ? '评估尚未完成' : `综合得分 ${score} 分`}
        >
          <svg viewBox="0 0 112 112" aria-hidden="true">
            <circle
              cx="56"
              cy="56"
              r="48"
              fill="none"
              stroke="#edf1f8"
              strokeWidth="5"
            />
            <circle
              cx="56"
              cy="56"
              r="48"
              fill="none"
              stroke="#477bd5"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="301.6"
              strokeDashoffset={301.6 * (1 - (score ?? 0) / 100)}
              transform="rotate(-90 56 56)"
            />
          </svg>
          <div>
            {score === null ? (
              <strong className={styles.pendingScore}>
                {active || preparing ? '评估中' : '待评估'}
              </strong>
            ) : (
              <strong>
                {workspace ? (
                  <span aria-hidden="true">{score}</span>
                ) : (
                  <AnimatedNumber value={score} />
                )}
                <small>/100</small>
              </strong>
            )}
          </div>
        </div>
        <p className={styles.verdict}>
          {active
            ? '正在检查这份简历'
            : interrupted
              ? `本轮评估未完成，已保留 ${progress?.completed ?? 0} 个视角的批注。${analysis ? '下方分数为上次完整结果。' : '可以重试。'}`
              : analysis?.verdict || '结合原文，检查表达、证据和结构。'}
        </p>
        {(active || preparing || interrupted) && (
          <ol className={styles.steps} aria-label="评估进度">
            {evaluationCopy.zh.phases.map((label, i) => {
              const reviewer =
                i > 0
                  ? progress?.reviewers?.find(
                      (entry) => entry.phase === REVIEW_PHASES[i],
                    )
                  : null;
              const done = reviewer
                ? reviewer.status === 'complete'
                : (i === 0 && phase > 0) || (!progress?.reviewers && phase > i);
              const failed = reviewer?.status === 'failed';
              const working = reviewer
                ? reviewer.status === 'running'
                : phase === i;
              return (
                <li
                  key={label}
                  data-active={working}
                  data-done={done}
                  data-failed={failed}
                >
                  <span>{done ? '✓' : failed ? '!' : working ? '•' : '·'}</span>
                  {label}
                </li>
              );
            })}
          </ol>
        )}
        {analysis && !active && (
          <div className={styles.dimensions} aria-label="评分维度">
            {Object.entries(analysis.category_averages).map(([key, value]) => (
              <div key={key}>
                <p>
                  <span>{evaluationCopy.zh.category[key] || key}</span>
                  <b>{Math.round(value)}</b>
                </p>
                <div>
                  <i
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {(analysis || progress) && (
          <div className={styles.annotationSummary}>
            <span>画布批注</span>
            <strong>
              {issues.length} <small>处建议</small>
            </strong>
            <p>
              {nativeComments
                ? '具体问题直接标在简历上，点击圈选区域或评论气泡查看，也可以回复和标记解决。'
                : '点击简历上的标记查看建议，在左侧对话中继续修改。'}
            </p>
            {!nativeComments ? null : annotations?.error ? (
              <>
                <p role="alert" className={styles.error}>
                  {annotations.error}
                </p>
                <button type="button" onClick={onRetryAnnotations}>
                  重试添加批注
                </button>
              </>
            ) : (
              <p>
                {annotations
                  ? `${annotations.mapped} 处已标注${annotations.pageLevel ? `，其中 ${annotations.pageLevel} 处是整页建议` : ''}`
                  : issues.length
                    ? '正在定位原文…'
                    : '发现的问题会逐项出现在画布上。'}
              </p>
            )}
            {issues.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onSelectIssue(issues[index % issues.length].id);
                  setIndex((previous) => previous + 1);
                }}
              >
                定位下一处批注 ↗
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className={styles.reviewButton}
          disabled={
            !canReview ||
            running ||
            active ||
            preparing ||
            !!(workspace && !workspace.selectedIds.length)
          }
          onClick={onReview}
        >
          {preparing
            ? '正在读取当前画布…'
            : active
              ? '评估进行中…'
              : workspace && workspace.targets.length > 1
                ? `评估选中的 ${workspace.selectedIds.length} 份`
                : analysis
                  ? '重新评估'
                  : '开始评估'}
        </button>
        {!canReview && (
          <p className={styles.footnote}>
            切换到共创或规划模式后，可以读取简历并评估。
          </p>
        )}
        <p className={styles.footnote}>
          评分依据本次读取的原文。修改后可重新评估；批注不会改写简历内容。
        </p>
      </div>
    </section>
  );
}
