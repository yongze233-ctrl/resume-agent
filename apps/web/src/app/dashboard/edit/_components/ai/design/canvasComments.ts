export interface CanvasComment {
  id: string;
  text: string;
  author: string;
  resolved: boolean;
  pageId: string;
  nodeId: string | null;
  nodeName?: string | null;
  position: { x: number; y: number };
  nearbyText: Array<{ id: string; text: string }>;
  replies: Array<{ id: string; text: string; author: string }>;
}

export type CanvasComments =
  | {
      status: 'ready';
      pageId: string;
      total: number;
      truncated: boolean;
      threads: CanvasComment[];
    }
  | { status: 'unavailable' };

/** Read at dispatch time so queued turns see comments added while the agent was busy. */
export function readCanvasComments(
  resumeId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<CanvasComments> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('resume-design:comments', receive);
      window.removeEventListener('resume-review:canvas-ready', ready);
      signal?.removeEventListener('abort', abort);
    };
    const request = () =>
      window.dispatchEvent(
        new CustomEvent('resume-design:read-comments', {
          detail: { resumeId, sessionId, requestId },
        }),
      );
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        detail?.requestId !== requestId ||
        detail?.resumeId !== resumeId ||
        detail?.sessionId !== sessionId
      )
        return;
      cleanup();
      const value = detail.comments;
      resolve(
        value?.status === 'ready' && Array.isArray(value.threads)
          ? value
          : { status: 'unavailable' },
      );
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
      resolve({ status: 'unavailable' });
    }, 12_000);
    if (signal?.aborted) {
      abort();
      return;
    }
    window.addEventListener('resume-design:comments', receive);
    window.addEventListener('resume-review:canvas-ready', ready);
    signal?.addEventListener('abort', abort, { once: true });
    request();
  });
}
