'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  FileText,
  RefreshCw,
  X,
  ArrowUpRight,
} from '@magic-resume-kit/icons';
import { useTranslation } from 'react-i18next';
import type { Resume } from '@/types/frontend/resume';
import type {
  AnalysisImprovementAction,
  EvaluationProgress,
  MultiPersonaResumeAnalysis,
} from '@/types/agent/multi-persona';
import { analysisImprovementActions } from '../lib/analysisIssues';
import { evaluationCopy } from './copy';
import {
  plainText,
  resolveEvidence,
  reviewActive,
  reviewSourceHash,
  REVIEW_PHASES,
} from './reviewModel';
import styles from './evaluation.module.css';
import { AnimatedNumber, BorderBeam, FindingEntry } from './motion/primitives';
import { hasReviewContent } from './canvasSource';

type Props = {
  resume: Resume;
  analysis: MultiPersonaResumeAnalysis | null;
  progress: EvaluationProgress | null;
  running: boolean;
  canReview: boolean;
  canFix: boolean;
  onReview: () => void;
  onFix: (issue: AnalysisImprovementAction) => void;
  onClose: () => void;
  activeIssueId?: string | null;
  onSelectIssue?: (id: string) => void;
  hasCanvasSource?: boolean;
  preparingSource?: boolean;
  sourceError?: string | null;
};

function Highlight({ text, quote }: { text: string; quote: string }) {
  const index = text.indexOf(quote);
  return index < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, index)}
      <mark>{quote}</mark>
      {text.slice(index + quote.length)}
    </>
  );
}

export default function ResumeEvaluationPanel({
  resume,
  analysis,
  progress,
  running,
  canReview,
  canFix,
  onReview,
  onFix,
  onClose,
  activeIssueId,
  onSelectIssue,
  hasCanvasSource = false,
  preparingSource = false,
  sourceError,
}: Props) {
  const { i18n } = useTranslation();
  const copy =
    evaluationCopy[
      (i18n.resolvedLanguage ?? i18n.language).startsWith('zh') ? 'zh' : 'en'
    ];
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<'issues' | 'dimensions' | 'checks'>('issues');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const { info, sections, sectionOrder } = resume;
  useEffect(() => {
    let active = true;
    void reviewSourceHash({ info, sections, sectionOrder })
      .then((next) => {
        if (active) setHash(next);
      })
      .catch(() => {
        if (active) setHash(null);
      });
    return () => {
      active = false;
    };
  }, [info, sections, sectionOrder]);
  const issues = useMemo(
    () => (analysis ? analysisImprovementActions(analysis, 24) : []),
    [analysis],
  );
  const inProgress = reviewActive(progress);
  const stale =
    !!analysis?.sourceHash && !!hash && analysis.sourceHash !== hash;
  const canStart = canReview && !running && !inProgress && !preparingSource;
  const hasContent = hasReviewContent(resume) || hasCanvasSource;
  const interrupted =
    progress?.phase === 'failed' || progress?.phase === 'stopped';
  const strengths = Array.from(
    new Set(
      [
        analysis?.peer_analysis,
        analysis?.leader_analysis,
        analysis?.hrbp_analysis,
      ].flatMap((p) => p?.strengths ?? []),
    ),
  ).slice(0, 3);
  const score = Math.round(analysis?.overall_score ?? 0);
  const verdict =
    analysis?.verdict ||
    copy.verdicts[score >= 85 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0];
  const currentIssue =
    activeIssueId ?? (expanded === null ? issues[0]?.id : expanded);
  useEffect(() => {
    if (!activeIssueId) return;
    const timer = setTimeout(() => {
      setTab('issues');
      if (issues.findIndex((issue) => issue.id === activeIssueId) > 2)
        setShowAll(true);
      requestAnimationFrame(() => {
        const article = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>('[data-issue-id]') ??
            [],
        ).find((element) => element.dataset.issueId === activeIssueId);
        article?.scrollIntoView({
          behavior: reduce ? 'instant' : 'smooth',
          block: 'nearest',
        });
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [activeIssueId, reduce, issues]);
  const countMissing = issues.filter(
    (issue) => issue.missingEvidence.length > 0,
  ).length;
  const date = analysis?.evaluatedAt ? new Date(analysis.evaluatedAt) : null;

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      aria-label={copy.title}
      data-evaluation-panel
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <FileText size={16} />
          <h2>{copy.title}</h2>
        </div>
        {analysis && !inProgress && (
          <button
            type="button"
            className={styles.reviewButton}
            disabled={!canStart || !hasContent}
            onClick={onReview}
            title={running ? copy.busy : undefined}
          >
            <RefreshCw size={13} />
            {copy.again}
          </button>
        )}
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={copy.close}
        >
          <X size={17} />
        </button>
      </header>
      <div className={styles.scroll} data-evaluation-scroll>
        {sourceError && (
          <div className={styles.notice} role="alert">
            <strong>{sourceError}</strong>
          </div>
        )}
        <div className={styles.documentName}>
          <FileText size={13} />
          <span>{resume.name}</span>
          {date && Number.isFinite(date.getTime()) && (
            <time dateTime={analysis?.evaluatedAt}>
              {copy.last}{' '}
              {date.toLocaleTimeString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          )}
        </div>

        {inProgress ? (
          <div className={styles.progress} role="status" aria-live="polite">
            <div className={styles.liveBadge}>
              <span />
              {copy.title}
              <BorderBeam />
            </div>
            <h3>
              {progress?.phase === 'reading' ? copy.running : copy.reviewing}
            </h3>
            <p>{copy.progressHint}</p>
            <ol className={styles.steps}>
              {REVIEW_PHASES.map((phase, i) => {
                const index = REVIEW_PHASES.indexOf(
                  progress!.phase as (typeof REVIEW_PHASES)[number],
                );
                const done = i < index;
                const active = phase === progress?.phase;
                return (
                  <li key={phase} data-done={done} data-active={active}>
                    <span className={styles.stepIcon}>
                      {done ? <Check size={13} /> : <span />}
                    </span>
                    <span>{copy.phases[i]}</span>
                    {active && <span className={styles.activeDot} />}
                  </li>
                );
              })}
            </ol>
            <div className={styles.progressFoot}>
              <span>{progress?.completed} / 3</span>
              <span>{copy.perspectives}</span>
            </div>
            <div className={styles.liveFindings}>
              <h4>
                {(i18n.resolvedLanguage ?? i18n.language).startsWith('zh')
                  ? `已发现 ${progress?.findings?.length ?? 0} 处可改进`
                  : `${progress?.findings?.length ?? 0} findings so far`}
              </h4>
              <AnimatePresence initial={false}>
                {progress?.findings?.map((issue, index) => (
                  <FindingEntry
                    key={issue.id}
                    className={styles.liveFinding}
                    data-issue-id={issue.id}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectIssue?.(issue.id)}
                    >
                      <span className={styles.findingPin}>{index + 1}</span>
                      <span>
                        <strong>{issue.problem}</strong>
                        {issue.evidence[0] && (
                          <small>“{issue.evidence[0].quote}”</small>
                        )}
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  </FindingEntry>
                ))}
              </AnimatePresence>
              <div className={styles.pendingFinding} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        ) : (
          <>
            {interrupted && (
              <div className={styles.notice} role="status">
                <strong>
                  {progress.phase === 'stopped'
                    ? copy.interrupted
                    : copy.failed}
                </strong>
                <p>{analysis ? copy.kept : copy.description}</p>
                <button
                  type="button"
                  onClick={onReview}
                  disabled={!canStart || !hasContent}
                >
                  {copy.retry}
                  <RefreshCw size={12} />
                </button>
              </div>
            )}

            {!analysis ? (
              <div className={styles.empty}>
                <div className={styles.emptyPaper} aria-hidden="true">
                  <FileText size={28} />
                  <Check size={15} />
                </div>
                <h3>{copy.intro}</h3>
                <p>{copy.description}</p>
                <div className={styles.emptyDimensions}>
                  <span>{copy.category.ClarityAndReadability}</span>
                  <span>{copy.category.CredibilityAndSpecificity}</span>
                  <span>{copy.category.StructureAndConsistency}</span>
                </div>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!canStart || !hasContent}
                  onClick={onReview}
                >
                  {preparingSource ? copy.readingCanvas : copy.review}
                  <ArrowUpRight size={15} />
                </button>
                {hasCanvasSource && (
                  <p className={styles.emptyHint}>{copy.canvasSourceHint}</p>
                )}
                {(!hasContent || !canReview) && (
                  <p className={styles.emptyHint}>
                    {!canReview ? copy.askHint : copy.emptyHint}
                  </p>
                )}
                <p className={styles.reference}>{copy.reference}</p>
              </div>
            ) : (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
              >
                {stale && (
                  <div className={styles.notice} role="status">
                    <strong>{copy.stale}</strong>
                    <p>{copy.staleHint}</p>
                  </div>
                )}
                {!analysis.sourceHash && (
                  <p className={styles.legacy}>{copy.legacy}</p>
                )}
                <section className={styles.overview}>
                  <div className={styles.verdict}>
                    <span>{copy.quality}</span>
                    <h3>{verdict}</h3>
                    <p>
                      {issues.length} {copy.count}
                      {countMissing > 0 && (
                        <>
                          ，{countMissing} {copy.missingCount}
                        </>
                      )}
                    </p>
                  </div>
                  <div className={styles.score}>
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <circle cx="50" cy="50" r="44" />
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="44"
                        pathLength="1"
                        initial={{ pathLength: reduce ? score / 100 : 0 }}
                        animate={{ pathLength: score / 100 }}
                        transition={{
                          duration: reduce ? 0 : 1.15,
                          ease: 'easeOut',
                        }}
                      />
                    </svg>
                    <strong>
                      <AnimatedNumber value={score} />
                    </strong>
                    <span>/ 100</span>
                    {typeof analysis.previousScore === 'number' && (
                      <small>
                        {score - analysis.previousScore > 0 ? '+' : ''}
                        {score - analysis.previousScore} {copy.changed}
                      </small>
                    )}
                  </div>
                </section>
                <p className={styles.reference}>{copy.reference}</p>
                <nav className={styles.tabs} aria-label={copy.title}>
                  {(['issues', 'dimensions', 'checks'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      aria-pressed={tab === key}
                    >
                      {key === 'issues'
                        ? copy.priority
                        : key === 'dimensions'
                          ? copy.dimensions
                          : copy.checks}
                      {key === 'issues' && <span>{issues.length}</span>}
                    </button>
                  ))}
                </nav>
                {tab === 'issues' && (
                  <div className={styles.issues}>
                    <div className={styles.sectionLabel}>{copy.top}</div>
                    {!issues.length && (
                      <p className={styles.emptyHint}>{copy.noIssues}</p>
                    )}
                    {(showAll ? issues : issues.slice(0, 3)).map(
                      (issue, index) => {
                        const open = currentIssue === issue.id;
                        const evidence = issue.evidence.map((ref) => ({
                          ref,
                          resolved: resolveEvidence(resume, ref),
                        }));
                        const invalid = evidence.some((item) => !item.resolved);
                        const severity = issue.severity ?? 'medium';
                        return (
                          <FindingEntry
                            className={styles.issue}
                            key={issue.id}
                            data-open={open}
                            data-issue-id={issue.id}
                          >
                            <button
                              type="button"
                              className={styles.issueHeading}
                              aria-expanded={open}
                              aria-controls={`review-issue-${issue.id}`}
                              onClick={() => {
                                setExpanded(open ? '' : issue.id);
                                onSelectIssue?.(open ? '' : issue.id);
                              }}
                            >
                              <span className={styles.issueNumber}>
                                {index + 1}
                              </span>
                              <span className={styles.issueTitle}>
                                <span
                                  className={styles.severity}
                                  data-level={severity}
                                >
                                  {copy[severity]}
                                </span>
                                <strong>{issue.problem}</strong>
                              </span>
                              <ChevronDown
                                size={15}
                                className={styles.chevron}
                              />
                            </button>
                            {open && (
                              <div
                                className={styles.issueBody}
                                id={`review-issue-${issue.id}`}
                              >
                                {evidence.length > 0 ? (
                                  <div className={styles.evidence}>
                                    <h4>{copy.original}</h4>
                                    {evidence.map(({ ref, resolved }, i) => (
                                      <div key={`${ref.path}-${i}`}>
                                        <span className={styles.sourceLabel}>
                                          {resolved?.title || ref.sectionKey}
                                        </span>
                                        <blockquote>
                                          “{plainText(ref.quote)}”
                                        </blockquote>
                                        {resolved ? (
                                          <details
                                            className={styles.sourceDetails}
                                          >
                                            <summary>{copy.locate}</summary>
                                            <p>
                                              <Highlight
                                                text={resolved.text}
                                                quote={resolved.quote}
                                              />
                                            </p>
                                          </details>
                                        ) : (
                                          <p className={styles.invalid}>
                                            {copy.changedEvidence}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className={styles.emptyEvidence}>
                                    {copy.noEvidence}
                                  </p>
                                )}
                                {issue.suggestion && (
                                  <div className={styles.suggestion}>
                                    <h4>{copy.suggestion}</h4>
                                    <p>{issue.suggestion}</p>
                                  </div>
                                )}
                                {issue.missingEvidence.length > 0 && (
                                  <div className={styles.missing}>
                                    <h4>{copy.missing}</h4>
                                    <ul>
                                      {issue.missingEvidence.map((item, i) => (
                                        <li key={i}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  className={styles.fix}
                                  disabled={
                                    running ||
                                    !canFix ||
                                    stale ||
                                    (!!analysis.sourceHash && !hash) ||
                                    invalid
                                  }
                                  onClick={() => onFix(issue)}
                                  title={!canFix ? copy.askHint : undefined}
                                >
                                  {issue.missingEvidence.length
                                    ? copy.supply
                                    : copy.fix}
                                  <ArrowUpRight size={14} />
                                </button>
                              </div>
                            )}
                          </FindingEntry>
                        );
                      },
                    )}
                    {issues.length > 3 && (
                      <button
                        className={styles.showMore}
                        type="button"
                        onClick={() => setShowAll(!showAll)}
                      >
                        {showAll
                          ? copy.fewer
                          : `${copy.more} (${issues.length - 3})`}
                        <ChevronDown size={13} />
                      </button>
                    )}
                    {strengths.length > 0 && (
                      <div className={styles.strengths}>
                        <h3>
                          <Check size={14} />
                          {copy.strengths}
                        </h3>
                        <ul>
                          {strengths.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {tab === 'dimensions' && (
                  <div className={styles.dimensions}>
                    {Object.entries(analysis.category_averages).map(
                      ([key, value]) => (
                        <div className={styles.dimension} key={key}>
                          <div>
                            <span>{copy.category[key] ?? key}</span>
                            <strong>
                              {Math.round(value)}
                              <small> / 100</small>
                            </strong>
                          </div>
                          <div className={styles.track}>
                            <motion.span
                              initial={false}
                              animate={{
                                scaleX: Math.max(0, Math.min(100, value)) / 100,
                              }}
                              transition={{ duration: reduce ? 0 : 0.24 }}
                            />
                          </div>
                        </div>
                      ),
                    )}
                    <p className={styles.reference}>{copy.exportHint}</p>
                  </div>
                )}
                {tab === 'checks' && (
                  <div className={styles.checks}>
                    <p className={styles.reference}>{copy.verified}</p>
                    {!analysis.checks?.length && (
                      <p className={styles.emptyHint}>{copy.noChecks}</p>
                    )}
                    {analysis.checks?.map((check) => (
                      <div
                        className={styles.check}
                        key={check.id}
                        data-status={check.status}
                      >
                        <span className={styles.checkIcon}>
                          {check.status === 'pass' ? (
                            <Check size={13} />
                          ) : check.status === 'warning' ? (
                            '!'
                          ) : (
                            '—'
                          )}
                        </span>
                        <div>
                          <h4>{copy.checkLabels[check.id] ?? check.id}</h4>
                          <p>
                            {copy.checkDetails[check.detail] ?? check.detail}
                          </p>
                        </div>
                        <span>
                          {check.status === 'pass'
                            ? copy.passed
                            : check.status === 'warning'
                              ? copy.warning
                              : copy.unknown}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
