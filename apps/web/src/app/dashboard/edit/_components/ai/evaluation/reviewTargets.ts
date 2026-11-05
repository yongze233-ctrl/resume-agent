import type { Resume } from '@/types/frontend/resume';
import type { CanvasReviewAnnotations } from './canvasAnnotations';
import type {
  EvaluationProgress,
  MultiPersonaResumeAnalysis,
} from '@/types/agent/multi-persona';

export interface ReviewTarget {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  width: number;
  height: number;
  textCount: number;
}
export interface FrameReview {
  designId: string;
  target: ReviewTarget;
  reviewKey: string;
  source?: Resume;
  analysis: MultiPersonaResumeAnalysis | null;
  progress: EvaluationProgress | null;
  error?: string;
}
export interface ReviewBatch {
  index: number;
  total: number;
  targetName: string;
}
export type ReviewRunOptions = {
  targetIds?: string[];
  addIntent?: boolean;
  openExisting?: boolean;
};
export const frameReviewKey = (designId: string, frameId: string) =>
  `${designId}/${frameId}`;

/** Correlate canvas requests; late events and unrelated editors cannot select the source. */
export function requestReviewCanvas(
  resumeId: string,
  operation: string,
  signal?: AbortSignal,
  target?: {
    frameId?: string;
    sessionId?: string;
    annotations?: CanvasReviewAnnotations;
  },
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const receiveName = `resume-review:${operation}-result`;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener(receiveName, receive);
      window.removeEventListener('resume-review:canvas-ready', ready);
      signal?.removeEventListener('abort', abort);
    };
    const request = () =>
      window.dispatchEvent(
        new CustomEvent(`resume-review:${operation}`, {
          detail: { resumeId, requestId, ...target },
        }),
      );
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.requestId !== requestId || detail?.resumeId !== resumeId)
        return;
      cleanup();
      if (detail.error) reject(new Error(detail.error));
      else resolve(detail.result);
    };
    const ready = (event: Event) => {
      if ((event as CustomEvent).detail?.resumeId === resumeId) request();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('读取已取消', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('设计画布还未连接，请等待画布加载后重试。'));
    }, 12_000);
    if (signal?.aborted) {
      abort();
      return;
    }
    window.addEventListener(receiveName, receive);
    window.addEventListener('resume-review:canvas-ready', ready);
    signal?.addEventListener('abort', abort, { once: true });
    request();
  });
}

export async function readReviewTargets(
  resumeId: string,
  designId: string,
  signal?: AbortSignal,
): Promise<ReviewTarget[]> {
  const value = (await requestReviewCanvas(resumeId, 'catalog', signal, {
    sessionId: designId,
  })) as { frames?: unknown[] } | null;
  if (!Array.isArray(value?.frames))
    throw new Error('无法读取画板列表，请重新连接画布。');
  const targets = value.frames
    .filter((value): value is ReviewTarget => {
      if (!value || typeof value !== 'object') return false;
      const frame = value as Record<string, unknown>;
      return (
        typeof frame.id === 'string' &&
        typeof frame.name === 'string' &&
        typeof frame.pageId === 'string' &&
        typeof frame.pageName === 'string' &&
        typeof frame.width === 'number' &&
        frame.width > 0 &&
        typeof frame.height === 'number' &&
        frame.height > 0 &&
        typeof frame.textCount === 'number' &&
        frame.textCount > 0
      );
    })
    .slice(0, 40);
  return targets.map((target, index) => ({
    ...target,
    name: !target.name.trim()
      ? `简历 ${index + 1}`
      : targets.filter((entry) => entry.name === target.name).length > 1
        ? `${target.name}（画板 ${index + 1}）`
        : target.name,
  }));
}
