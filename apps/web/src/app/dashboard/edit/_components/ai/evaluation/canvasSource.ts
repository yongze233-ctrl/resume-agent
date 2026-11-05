import { resumeSchema } from '@magic-resume-kit/resume-schema';
import type { Resume } from '@/types/frontend/resume';
import type { DesignSnapshot } from './scanModel';
import { plainText } from './reviewModel';

export const CANVAS_REVIEW_SECTION = 'custom_canvas_review';
export type CanvasInspection = Pick<
  DesignSnapshot,
  'width' | 'height' | 'nodes'
> & { frameId?: string; frameName?: string; pageId?: string };

export function hasReviewContent(resume: Pick<Resume, 'sections'>): boolean {
  return Object.values(resume.sections).some(
    (items) =>
      Array.isArray(items) &&
      items.some(
        (item) =>
          item.visible !== false &&
          Object.entries(item).some(
            ([key, value]) =>
              !['id', 'visible', 'icon'].includes(key) &&
              typeof value === 'string' &&
              plainText(value).length > 0,
          ),
      ),
  );
}

/** A read-only model input using the existing resume schema. Never apply it to the document store. */
export function canvasReviewDocument(
  resume: Resume,
  inspection: CanvasInspection,
): Resume {
  const nodes = inspection.nodes.filter(
    (node) =>
      node.type === 'TEXT' &&
      typeof node.text === 'string' &&
      node.text.trim().length > 0 &&
      node.width > 0 &&
      node.height > 0,
  );
  if (!nodes.length)
    throw new Error(
      '画布中还没有可读取的简历文字，请先完成内容或重新连接画布。',
    );
  const seen = new Set<string>();
  const items = nodes
    .filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
    .map((node) => ({ id: node.id, visible: true, summary: node.text! }));
  const parsed = resumeSchema.parse({
    ...resume,
    info: {
      fullName: '',
      headline: '',
      email: '',
      phoneNumber: '',
      address: '',
      website: '',
      avatar: '',
      customFields: [],
    },
    sections: { [CANVAS_REVIEW_SECTION]: items },
    sectionOrder: [
      { key: 'basics', label: '个人信息' },
      { key: CANVAS_REVIEW_SECTION, label: '当前设计画布原文' },
    ],
  });
  return {
    ...parsed,
    id: resume.id,
    updatedAt: resume.updatedAt,
    sections: { [CANVAS_REVIEW_SECTION]: items },
  };
}

/** Read live text nodes through the existing local canvas bridge, with no export or write. */
export function readCanvasReviewSource(
  resumeId: string,
  signal?: AbortSignal,
  target?: { frameId: string; sessionId: string },
): Promise<CanvasInspection> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('resume-review:source', receive);
      window.removeEventListener('resume-review:canvas-ready', ready);
      signal?.removeEventListener('abort', abort);
    };
    const request = () =>
      window.dispatchEvent(
        new CustomEvent('resume-review:read-source', {
          detail: { resumeId, requestId, ...target },
        }),
      );
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.requestId !== requestId || detail?.resumeId !== resumeId)
        return;
      cleanup();
      if (detail.error) reject(new Error(detail.error));
      else if (
        detail.inspection &&
        Array.isArray(detail.inspection.nodes) &&
        detail.inspection.width > 0 &&
        detail.inspection.height > 0
      ) {
        if (target && detail.inspection.frameId !== target.frameId)
          reject(new Error('读取到的简历与所选画板不一致，请重试。'));
        else resolve(detail.inspection);
      } else reject(new Error('没有读到画布文字，请重新连接画布后重试。'));
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
      reject(new Error('画布暂未连接，请等待画布加载完成后重试。'));
    }, 12_000);
    if (signal?.aborted) {
      abort();
      return;
    }
    window.addEventListener('resume-review:source', receive);
    window.addEventListener('resume-review:canvas-ready', ready);
    signal?.addEventListener('abort', abort, { once: true });
    request();
  });
}
