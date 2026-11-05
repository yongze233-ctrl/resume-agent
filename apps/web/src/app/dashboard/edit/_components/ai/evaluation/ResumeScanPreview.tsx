'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FileText, Check, X } from '@magic-resume-kit/icons';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';
import { annotate } from 'rough-notation';
import type { Resume } from '@/types/frontend/resume';
import type {
  AnalysisImprovementAction,
  EvaluationProgress,
} from '@/types/agent/multi-persona';
import ResumePreview from '../../preview/ResumePreview';
import {
  EditableCanvasProvider,
  type EditableCanvasContextValue,
} from '../lib/editableCanvas';
import { BorderBeam } from './motion/primitives';
import {
  snapshotIssueRect,
  type DesignSnapshot,
  type PaperRect,
} from './scanModel';
import {
  plainText,
  resolveEvidence,
  reviewActive,
  REVIEW_PHASES,
} from './reviewModel';
import { evaluationCopy } from './copy';
import styles from './evaluation.module.css';
import { hasReviewContent } from './canvasSource';

const noop = () => {};
const readOnly: EditableCanvasContextValue = {
  enabled: true,
  pendingByPath: {},
  processingPaths: [],
  errorsByPath: {},
  activePath: null,
  onHandleClick: noop,
  onAccept: noop,
  onDiscard: noop,
  onRegenerate: noop,
  onRetry: noop,
  onSectionHandleClick: noop,
};
type Props = {
  resume: Resume;
  templateId: string;
  progress: EvaluationProgress | null;
  issues: AnalysisImprovementAction[];
  activeIssueId: string | null;
  onSelectIssue: (id: string | null) => void;
  onClose: () => void;
};

export default function ResumeScanPreview({
  resume,
  templateId,
  progress,
  issues,
  activeIssueId,
  onSelectIssue,
  onClose,
}: Props) {
  const { i18n } = useTranslation();
  const zh = (i18n.resolvedLanguage ?? i18n.language).startsWith('zh');
  const copy = evaluationCopy[zh ? 'zh' : 'en'];
  const reduce = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const documentBody = useRef<HTMLDivElement>(null);
  const focusBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.68);
  const [height, setHeight] = useState(1123);
  const [snapshot, setSnapshot] = useState<DesignSnapshot | null>(null);
  const [regions, setRegions] = useState<Array<PaperRect & { id: string }>>([]);
  const [scanIndex, setScanIndex] = useState(0);
  const [markers, setMarkers] = useState<
    Array<PaperRect & { id: string; index: number }>
  >([]);
  const scanning = reviewActive(progress);
  const width = snapshot?.width ?? 794;
  const phase = Math.max(
    0,
    REVIEW_PHASES.indexOf(progress?.phase as (typeof REVIEW_PHASES)[number]),
  );
  const active = markers.find((marker) => marker.id === activeIssueId);
  const activeIssue = issues.find((issue) => issue.id === activeIssueId);
  const focus =
    active ??
    (scanning ? regions[scanIndex % Math.max(1, regions.length)] : null);
  const focusY = focus?.y;
  const activeId = active?.id;

  useEffect(() => {
    let live = true;
    const requestId = crypto.randomUUID();
    const request = () =>
      window.dispatchEvent(
        new CustomEvent('resume-review:request-preview', {
          detail: { resumeId: resume.id, requestId },
        }),
      );
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const next = detail?.preview;
      if (
        live &&
        detail?.requestId === requestId &&
        next?.image?.startsWith('data:image/png;base64,') &&
        next.width > 0 &&
        next.height > 0 &&
        Array.isArray(next.nodes)
      )
        setSnapshot(next);
    };
    const ready = (event: Event) => {
      if ((event as CustomEvent).detail?.resumeId === resume.id) request();
    };
    window.addEventListener('resume-review:preview', receive);
    window.addEventListener('resume-review:canvas-ready', ready);
    request();
    return () => {
      live = false;
      window.removeEventListener('resume-review:preview', receive);
      window.removeEventListener('resume-review:canvas-ready', ready);
    };
  }, [resume.id]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () =>
      setScale(
        Math.min(0.9, Math.max(0.25, (element.clientWidth - 88) / width)),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [width]);

  useEffect(() => {
    const element = paper.current;
    if (!element) return;
    const measure = () => {
      if (snapshot) {
        setHeight(snapshot.height);
        const texts = snapshot.nodes.filter(
          (node) =>
            node.type === 'TEXT' && node.height > 4 && node.text?.trim(),
        );
        setRegions(
          texts
            .filter(
              (_, i) => i % Math.max(1, Math.floor(texts.length / 8)) === 0,
            )
            .slice(0, 10)
            .map((node) => ({
              ...node,
              x: Math.max(12, node.x - 5),
              width: Math.min(width - node.x - 12, node.width + 10),
            })),
        );
        setMarkers(
          issues.flatMap((issue, index) => {
            const rect = snapshotIssueRect(snapshot, issue);
            return rect ? [{ ...rect, id: issue.id, index }] : [];
          }),
        );
      } else {
        setHeight(Math.max(1123, documentBody.current?.scrollHeight ?? 1123));
        const origin = element.getBoundingClientRect();
        const fields = Array.from(
          element.querySelectorAll<HTMLElement>('[data-resume-path]'),
        );
        const rectFor = (node: HTMLElement) => {
          const r = node.getBoundingClientRect();
          return {
            x: (r.left - origin.left) / scale,
            y: (r.top - origin.top) / scale,
            width: r.width / scale,
            height: r.height / scale,
          };
        };
        const content = fields.filter(
          (field) => (field.textContent?.trim().length ?? 0) > 8,
        );
        setRegions(
          content
            .filter(
              (_, i) => i % Math.max(1, Math.floor(content.length / 8)) === 0,
            )
            .slice(0, 10)
            .map((node, i) => ({ ...rectFor(node), id: `region-${i}` })),
        );
        setMarkers(
          issues.flatMap((issue, index) => {
            const ref = issue.evidence.find(
              (ref) =>
                resolveEvidence(resume, ref) &&
                fields.some(
                  (field) =>
                    field.dataset.resumePath ===
                    `sections.${ref.sectionKey}[${ref.itemId}].${ref.fieldKey}`,
                ),
            );
            const node = ref
              ? fields.find(
                  (field) =>
                    field.dataset.resumePath ===
                    `sections.${ref.sectionKey}[${ref.itemId}].${ref.fieldKey}`,
                )
              : undefined;
            if (!node || !ref) return [];
            const walker = document.createTreeWalker(
              node,
              NodeFilter.SHOW_TEXT,
            );
            const texts: Text[] = [];
            while (walker.nextNode()) texts.push(walker.currentNode as Text);
            const quote = plainText(ref.quote);
            const text = texts.map((part) => part.data).join('');
            const start = text.indexOf(quote);
            let rect = rectFor(node);
            if (start >= 0 && quote.length) {
              const range = document.createRange();
              let offset = 0;
              for (const part of texts) {
                if (offset <= start && start < offset + part.length)
                  range.setStart(part, start - offset);
                if (
                  offset < start + quote.length &&
                  start + quote.length <= offset + part.length
                )
                  range.setEnd(part, start + quote.length - offset);
                offset += part.length;
              }
              const bounds = range.getBoundingClientRect();
              if (bounds.width > 0 && bounds.height > 0)
                rect = {
                  x: (bounds.left - origin.left) / scale,
                  y: (bounds.top - origin.top) / scale,
                  width: bounds.width / scale,
                  height: bounds.height / scale,
                };
            }
            return [{ ...rect, id: issue.id, index }];
          }),
        );
      }
    };
    const observer = new ResizeObserver(measure);
    if (documentBody.current) observer.observe(documentBody.current);
    const mutation = new MutationObserver(measure);
    if (documentBody.current)
      mutation.observe(documentBody.current, {
        childList: true,
        subtree: true,
      });
    measure();
    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, [snapshot, issues, scale, width, resume]);

  useEffect(() => {
    if (!scanning || reduce || activeIssueId || !regions.length) return;
    const timer = setInterval(() => setScanIndex((index) => index + 1), 2600);
    return () => clearInterval(timer);
  }, [scanning, reduce, activeIssueId, regions.length]);

  useEffect(() => {
    if (focusY === undefined || !viewport.current) return;
    const target = Math.max(
      0,
      focusY * scale - viewport.current.clientHeight * 0.3 + 38,
    );
    viewport.current.scrollTo({
      top: target,
      behavior: reduce ? 'instant' : 'smooth',
    });
  }, [focusY, scale, reduce]);

  useEffect(() => {
    if (!activeId) return;
    let annotation: ReturnType<typeof annotate> | undefined;
    const timer = setTimeout(
      () => {
        if (!focusBox.current) return;
        annotation = annotate(focusBox.current, {
          type: 'box',
          color: '#5277e9',
          strokeWidth: 1.5,
          padding: 1,
          iterations: 1,
          animate: !reduce,
          animationDuration: 450,
        });
        annotation.show();
      },
      reduce ? 0 : 650,
    );
    return () => {
      clearTimeout(timer);
      annotation?.remove();
    };
  }, [activeId, markers, reduce]);

  const source = snapshot
    ? zh
      ? '当前设计画布快照'
      : 'Current design snapshot'
    : zh
      ? '当前简历内容'
      : 'Current resume content';
  const status = scanning
    ? copy.phases[phase]
    : progress?.phase === 'failed'
      ? copy.failed
      : progress?.phase === 'stopped'
        ? copy.interrupted
        : zh
          ? '点击简历上的标记，查看批注'
          : 'Select a mark on the resume to view its comment';
  const stageLabel = useMemo(
    () =>
      scanning
        ? zh
          ? '正在浏览原文'
          : 'Reading source'
        : `${markers.length} ${zh ? '处原文定位' : 'source locations'}`,
    [scanning, zh, markers.length],
  );
  return (
    <section
      className={styles.scanPreview}
      aria-label={zh ? '简历浏览评估' : 'Resume review preview'}
      data-review-preview
    >
      <header className={styles.scanHeader}>
        <span>
          <FileText size={14} />
          {source}
        </span>
        <button
          type="button"
          aria-label={zh ? '返回对话' : 'Back to conversation'}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className={styles.readingStatus}>
        <span className={scanning ? styles.readingDot : styles.completeDot}>
          {!scanning && <Check size={11} />}
        </span>
        <span>{status}</span>
        <span>{stageLabel}</span>
      </div>
      <div
        className={styles.paperViewport}
        ref={viewport}
        data-review-paper-scroll
      >
        <div
          className={styles.paperSize}
          style={{ width: width * scale, height: height * scale }}
        >
          <div
            ref={paper}
            className={styles.reviewPaper}
            style={{ width, minHeight: height, transform: `scale(${scale})` }}
          >
            <div ref={documentBody} data-review-document>
              {snapshot ? (
                <Image
                  src={snapshot.image}
                  width={snapshot.width}
                  height={snapshot.height}
                  alt={
                    zh
                      ? '当前简历设计，包含原版式与照片'
                      : 'Current resume design'
                  }
                  unoptimized
                  draggable={false}
                />
              ) : (
                <EditableCanvasProvider value={readOnly}>
                  <ResumePreview
                    info={resume.info}
                    sections={resume.sections}
                    sectionOrder={resume.sectionOrder ?? []}
                    templateId={templateId}
                    documentLanguage={resume.documentLanguage}
                    customTemplate={resume.customTemplate}
                    templateOverride={resume.templateOverride}
                  />
                </EditableCanvasProvider>
              )}
            </div>
            <div
              className={styles.paperAnnotations}
              style={{ '--review-inverse-scale': 1 / scale } as CSSProperties}
            >
              <AnimatePresence>
                {focus && (
                  <motion.div
                    key="reader"
                    ref={focusBox}
                    className={styles.readingFocus}
                    data-reading-focus
                    data-active-issue={active?.id}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{
                      x: focus.x - (active ? 2 : 7),
                      y: focus.y - (active ? 2 : 7),
                      width: focus.width + (active ? 4 : 14),
                      height: active
                        ? focus.height + 4
                        : Math.max(30, focus.height + 14),
                      opacity: 1,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: reduce ? 0 : 0.6,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    {scanning && !active && (
                      <>
                        <BorderBeam />
                        <motion.div
                          className={styles.scanBand}
                          animate={
                            reduce ? {} : { y: [0, Math.max(20, focus.height)] }
                          }
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        />
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  className={styles.paperMarker}
                  aria-label={`${zh ? '查看问题' : 'View finding'} ${marker.index + 1}`}
                  aria-pressed={marker.id === activeIssueId}
                  style={{
                    left: Math.min(width - 18, marker.x + marker.width + 8),
                    top: marker.y,
                  }}
                  onClick={() => onSelectIssue(marker.id)}
                >
                  {marker.index + 1}
                </button>
              ))}
              {active && activeIssue && (
                <aside
                  aria-label={zh ? '评估批注' : 'Review comment'}
                  className={styles.inlineReviewComment}
                  style={{
                    left: Math.max(0, Math.min(width - 280 / scale, active.x)),
                    top: Math.min(
                      height - 160 / scale,
                      active.y + active.height + 12,
                    ),
                    transform: `scale(${1 / scale})`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={zh ? '关闭批注' : 'Close comment'}
                    onClick={() => onSelectIssue(null)}
                  >
                    ×
                  </button>
                  <strong>{zh ? '简历评估' : 'Resume review'}</strong>
                  <p>{activeIssue.problem}</p>
                  <p>{activeIssue.suggestion}</p>
                </aside>
              )}
            </div>
          </div>
        </div>
      </div>
      <footer className={styles.scanFooter}>
        <span>{source}</span>
        <span>
          {snapshot
            ? zh
              ? hasReviewContent(resume)
                ? '报告依据已导入内容'
                : '报告依据当前画布文字'
              : hasReviewContent(resume)
                ? 'Review uses imported content'
                : 'Review uses current canvas text'
            : zh
              ? '内容评估 · 原文不改动'
              : 'Content review · Source preserved'}
        </span>
      </footer>
    </section>
  );
}
