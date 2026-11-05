'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { dbClient } from '@/lib/api/IndexDBClient';
import type { Resume } from '@/types/frontend/resume';
import { inspectPencilPdf } from '@/lib/ai/inspectPencilPdf';
import { reportFrontendError } from '@/lib/diagnostics/frontend';
import { portraitRepairScript, readOriginalPortrait, type OriginalPortrait } from '@/lib/ai/pencilPortrait';
import { useTranslation } from 'react-i18next';
import styles from './design-studio.module.css';
import type { CanvasReviewAnnotations, CanvasAnnotationStatus } from '../evaluation/canvasAnnotations';

export interface PencilProposal {
  engine: 'openpencil'; sessionId: string; sourceHash: string; rationale: string;
  status: 'working' | 'ready' | 'failed'; frameId?: string; frameIds?: string[]; portraitImageHash?: string; review?: string;
  steps: Array<{ title: string; detail: string; status: 'running' | 'completed' | 'failed' }>;
}
type Bundle = { fig: string; pdf: string; frameId?: string; frameIds?: string[]; accepted?: boolean; sourceHash?: string; inspection?: { nodes: Array<{ id: string; type: string }> } };
type Snapshot = { fig: string; frameId?: string };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const EDITOR_URL = (process.env.NEXT_PUBLIC_OPENPENCIL_URL || (process.env.NODE_ENV === 'production' ? '/pencil' : 'http://127.0.0.1:1420')).replace(/\/$/, '');
const editorOrigin = () => new URL(EDITOR_URL, window.location.href).origin;
const isBundle = (value: unknown): value is Bundle => !!value && typeof value === 'object' && 'fig' in value && typeof value.fig === 'string' && 'pdf' in value && typeof value.pdf === 'string';
const isSnapshot = (value: unknown): value is Snapshot => !!value && typeof value === 'object' && 'fig' in value && typeof value.fig === 'string';

export default function OpenPencilStudio({ proposal, resume, onClose, annotations, onAnnotationStatus, attachmentKey, runActive }: { proposal: PencilProposal; resume: Resume; onClose: () => void; annotations?: CanvasReviewAnnotations; onAnnotationStatus?: (status: CanvasAnnotationStatus) => void; attachmentKey?: string; runActive?: boolean }) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<string, Pending>());
  const online = useRef(false);
  const loaded = useRef<() => void>(() => {});
  const currentFrame = useRef<string | undefined>(proposal.frameId);
  const currentFrames = useRef<string[] | undefined>(proposal.frameIds);
  const [connected, setConnected] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [portraitNotice, setPortraitNotice] = useState('');
  const [portraitRetry, setPortraitRetry] = useState(0);
  const portraitAttempt = useRef('');
  const rpc = useCallback((operation: string, args: Record<string, unknown> = {}): Promise<unknown> => new Promise((resolve, reject) => {
    if (!online.current || !frame.current?.contentWindow) { reject(new Error('设计画布还未连接')); return; }
    const id = typeof args.id === 'string' ? args.id : crypto.randomUUID();
    const timer = setTimeout(() => { pending.current.delete(id); reportFrontendError({component:'design',category:'operation',code:'canvas_operation_timeout'}); reject(new Error('画布操作超时')); }, 65_000);
    pending.current.set(id, { resolve, reject, timer });
    frame.current.contentWindow.postMessage({ type: 'magic-resume:request', channel: proposal.sessionId, id, operation, ...args }, editorOrigin());
  }), [proposal.sessionId]);
  useEffect(() => {
    if (!connected || !hasFrame || runActive || (!attachmentKey && !resume.info.avatar)) return;
    const signature = `${proposal.sessionId}:${attachmentKey ?? resume.info.avatar.length}:${currentFrame.current}:${portraitRetry}`;
    if (portraitAttempt.current === signature) return;
    portraitAttempt.current = signature;
    const controller = new AbortController();
    let done = false;
    setPortraitBusy(true);
    setPortraitNotice('');
    void (async () => {
      let image: OriginalPortrait | undefined;
      if (/^data:image\/(?:png|jpeg);base64,/.test(resume.info.avatar)) {
        const bitmap = await createImageBitmap(await (await fetch(resume.info.avatar, { signal: controller.signal })).blob());
        image = { id: 'resume-avatar', dataUrl: resume.info.avatar, width: bitmap.width, height: bitmap.height };
        bitmap.close();
      } else if (attachmentKey) {
        const extracted = await readOriginalPortrait(attachmentKey, controller.signal);
        if (extracted.status === 'ambiguous') { setPortraitNotice(t('aiLab.design.portraitAmbiguous')); return; }
        image = extracted.image;
      }
      if (!image) return;
      controller.signal.throwIfAborted();
      const markerKey = `openpencil-portrait:${resume.id}:${proposal.sessionId}`;
      const previous = await dbClient.getItem<{ sourceId: string; frameId?: string }>(markerKey);
      const place = portraitRetry > 0 || previous?.sourceId !== image.id || previous.frameId !== currentFrame.current;
      controller.signal.throwIfAborted();
      const evaluated = await rpc('call', { command: 'eval', args: { code: portraitRepairScript(image, currentFrame.current, place) } }) as { ok?: boolean; error?: string; result?: { status: string; imageHash: string; frameId: string } };
      if (!evaluated.ok || !evaluated.result) throw new Error('portrait_insert_failed');
      const result = evaluated.result;
      if (result.status === 'needs_layout') { setPortraitNotice(t('aiLab.design.portraitNeedsLayout')); return; }
      if (result.status === 'inserted') {
        const draft = await rpc('snapshot', { frameId: result.frameId });
        if (!isSnapshot(draft)) throw new Error('portrait_snapshot_failed');
        const cacheKey = `openpencil-design:${resume.id}:${proposal.sessionId}`;
        const cached = await dbClient.getItem<Bundle>(cacheKey);
        await dbClient.setItem(cacheKey, { ...cached, ...draft, frameId: result.frameId, frameIds: currentFrames.current, pdf: '', sourceHash: proposal.sourceHash, accepted: false });
        setAccepted(false);
        toast.success(t('aiLab.design.portraitRecovered'));
      }
      if (result.status === 'inserted' || result.status === 'retained') await dbClient.setItem(markerKey, { sourceId: image.id, frameId: result.frameId });
    })().catch(error => {
      if (controller.signal.aborted) return;
      reportFrontendError({ error, component: 'design', category: 'operation', code: 'portrait_restore_failed' });
      setPortraitNotice(t('aiLab.design.portraitFailed'));
    }).finally(() => { done = true; if (!controller.signal.aborted) setPortraitBusy(false); });
    return () => { controller.abort(); if (!done && portraitAttempt.current === signature) portraitAttempt.current = ''; };
  }, [connected, hasFrame, runActive, attachmentKey, resume.id, resume.info.avatar, proposal.sessionId, proposal.sourceHash, portraitRetry, rpc, t]);
  useEffect(() => { if (proposal.frameId) currentFrame.current = proposal.frameId; }, [proposal.frameId]);
  useEffect(() => { if (proposal.frameIds) currentFrames.current = proposal.frameIds; }, [proposal.frameIds]);
  const annotationPayload = annotations ? JSON.stringify(annotations) : '';
  useEffect(() => {
    if (!connected || !hasFrame || !annotationPayload) return;
    let live = true;
    const timer = setTimeout(() => {
      const payload = JSON.parse(annotationPayload) as CanvasReviewAnnotations;
      void rpc('review', { frameId: payload.frameId, args: payload })
        .then((result) => { if (live && onAnnotationStatus) onAnnotationStatus(result as CanvasAnnotationStatus); })
        .catch((error) => { if (live && onAnnotationStatus) onAnnotationStatus({ mapped: 0, pageLevel: 0, error: error instanceof Error ? error.message : '批注写入失败' }); });
    }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [connected, hasFrame, annotationPayload, rpc, onAnnotationStatus]);
  useEffect(() => {
    let disposed = false;
    const preview = async (event: Event) => {
      const detail = (event as CustomEvent<{ resumeId: string; requestId: string }>).detail;
      if (detail?.resumeId !== resume.id || !connected) return;
      try {
        const inspection = await rpc('inspect', { frameId: currentFrame.current }) as { rootId?: string; width?: number; height?: number; nodes?: unknown[] };
        if (!inspection.rootId) return;
        const exported = await rpc('call', { command: 'export', args: { nodeIds: [inspection.rootId], scale: 1.5, format: 'PNG' } }) as { result?: { base64?: string; mimeType?: string } };
        const image = exported.result;
        if (!disposed && image?.base64 && image.mimeType === 'image/png') window.dispatchEvent(new CustomEvent('resume-review:preview', { detail: { ...detail, preview: { ...inspection, image: `data:image/png;base64,${image.base64}` } } }));
      } catch { /* The review falls back to the current structured document. */ }
    };
    window.addEventListener('resume-review:request-preview', preview);
    const readSource = async (event: Event) => {
      const detail = (event as CustomEvent<{ resumeId: string; requestId: string; frameId?: string; sessionId?: string }>).detail;
      if (detail?.resumeId !== resume.id || !connected || (detail.sessionId && detail.sessionId !== proposal.sessionId)) return;
      try {
        const inspection = await rpc('review-source', { frameId: detail.frameId }) as { rootId?: string };
        if (inspection.rootId) { currentFrame.current = inspection.rootId; setHasFrame(true); }
        if (!disposed) window.dispatchEvent(new CustomEvent('resume-review:source', { detail: { ...detail, inspection } }));
      } catch (error) {
        if (!disposed) window.dispatchEvent(new CustomEvent('resume-review:source', { detail: { ...detail, error: error instanceof Error ? error.message : '画布文字读取失败，请重试。' } }));
      }
    };
    window.addEventListener('resume-review:read-source', readSource);
    const reviewOperation = (operation: 'catalog' | 'focus' | 'annotate') => async (event: Event) => {
      const detail = (event as CustomEvent<{ resumeId: string; requestId: string; frameId?: string; sessionId?: string; annotations?: CanvasReviewAnnotations }>).detail;
      if (detail?.resumeId !== resume.id || !connected || detail.sessionId !== proposal.sessionId) return;
      try {
        const result = await rpc(operation === 'annotate' ? 'review' : `review-${operation}`, { frameId: detail.frameId, args: detail.annotations });
        if (!disposed) window.dispatchEvent(new CustomEvent(`resume-review:${operation}-result`, { detail: { ...detail, result } }));
      } catch (error) {
        if (!disposed) window.dispatchEvent(new CustomEvent(`resume-review:${operation}-result`, { detail: { ...detail, error: error instanceof Error ? error.message : '无法读取简历画板' } }));
      }
    };
    const catalog = reviewOperation('catalog'), focus = reviewOperation('focus'), annotate = reviewOperation('annotate');
    window.addEventListener('resume-review:catalog', catalog);
    window.addEventListener('resume-review:focus', focus);
    window.addEventListener('resume-review:annotate', annotate);
    const readComments = async (event: Event) => {
      const detail = (event as CustomEvent<{ resumeId: string; sessionId: string; requestId: string }>).detail;
      if (detail?.resumeId !== resume.id || detail?.sessionId !== proposal.sessionId || !connected) return;
      try {
        const comments = await rpc('comments');
        if (!disposed) window.dispatchEvent(new CustomEvent('resume-design:comments', { detail: { ...detail, comments } }));
      } catch {
        if (!disposed) window.dispatchEvent(new CustomEvent('resume-design:comments', { detail: { ...detail, comments: { status: 'unavailable' } } }));
      }
    };
    window.addEventListener('resume-design:read-comments', readComments);
    if (connected) window.dispatchEvent(new CustomEvent('resume-review:canvas-ready', { detail: { resumeId: resume.id } }));
    return () => { disposed = true; window.removeEventListener('resume-review:request-preview', preview); window.removeEventListener('resume-review:read-source', readSource); window.removeEventListener('resume-design:read-comments', readComments); window.removeEventListener('resume-review:catalog', catalog); window.removeEventListener('resume-review:focus', focus); window.removeEventListener('resume-review:annotate', annotate); };
  }, [connected, resume.id, proposal.sessionId, rpc]);
  useEffect(() => {
    let cancelled = false;
    let instanceId: string | undefined;
    let epoch = 0;
    let timer: ReturnType<typeof setTimeout>;
    const cacheKey = `openpencil-design:${resume.id}:${proposal.sessionId}`;
    loaded.current = () => {
      epoch++; instanceId = undefined; online.current = false; setConnected(false);
      clearTimeout(timer);
      for (const waiting of pending.current.values()) { clearTimeout(waiting.timer); waiting.reject(new Error('画布正在重新连接')); }
      pending.current.clear();
    };
    async function poll(ownEpoch: number) {
      if (cancelled || ownEpoch !== epoch) return;
      try {
        const response = await fetch(`/api/openpencil/${proposal.sessionId}`, { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json() as { job?: { id: string; operation: string; command?: string; args?: Record<string, unknown>; frameId?: string } | null };
          if (data.job) {
            const job = data.job;
            let result: unknown;
            let failure: string | undefined;
            try {
              result = await rpc(job.operation, { id: job.id, command: job.command, args: job.args, frameId: job.frameId });
              if (isBundle(result)) {
                result = { ...result, ...await inspectPencilPdf(result.pdf) };
                if (!isBundle(result)) throw new Error('设计导出结果不完整');
                const resolvedFrame = result.frameId ?? job.frameId;
                const stored = { ...result, frameId: resolvedFrame, sourceHash: proposal.sourceHash, accepted: false };
                await dbClient.setItem(cacheKey, stored);
                currentFrame.current = resolvedFrame;
                currentFrames.current = result.frameIds;
                setHasFrame(true);
              } else if (job.operation === 'call' || job.operation === 'inspect') {
                const nativeResult = result as { result?: { frameId?: unknown; frameIds?: unknown } } | null;
                if (typeof nativeResult?.result?.frameId === 'string') currentFrame.current = nativeResult.result.frameId;
                const frameIds = nativeResult?.result?.frameIds;
                if (Array.isArray(frameIds) && frameIds.length > 0 && frameIds.every((id): id is string => typeof id === 'string')) {
                  currentFrames.current = frameIds;
                  currentFrame.current = frameIds[0];
                }
                const draft = await rpc('snapshot', { frameId: currentFrame.current });
                if (!isSnapshot(draft)) throw new Error('草稿保存失败');
                const previous = await dbClient.getItem<Bundle>(cacheKey);
                const keepAccepted = job.operation !== 'call' && previous?.accepted === true;
                await dbClient.setItem(cacheKey, { ...draft, frameIds: currentFrames.current, pdf: '', sourceHash: proposal.sourceHash, accepted: keepAccepted });
                currentFrame.current = draft.frameId;
                setHasFrame(!!draft.frameId);
                setAccepted(keepAccepted);
              }
            } catch (error) { failure = error instanceof Error ? error.message : '画布操作失败'; }
            if (!cancelled && ownEpoch === epoch) await fetch(`/api/openpencil/${proposal.sessionId}/jobs/${job.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: !failure, result, error: failure }) });
          }
        }
      } catch { /* A short backend restart does not discard the local design. */ }
      if (!cancelled && ownEpoch === epoch) timer = setTimeout(() => { void poll(ownEpoch); }, 750);
    }
    async function initialize(ownEpoch: number) {
      try {
        const own = await dbClient.getItem<Bundle>(cacheKey);
        const saved = own ?? await dbClient.getItem<Bundle>(`openpencil-design:${resume.id}`);
        if (saved?.fig && saved.sourceHash === proposal.sourceHash) {
          currentFrames.current = saved.frameIds ?? currentFrames.current;
          const restored = await rpc('restore', { fig: saved.fig }) as { nodes?: Array<{ id: string; type: string }> };
          currentFrame.current = restored.nodes?.find((node) => node.type === 'FRAME' && node.id === saved.frameId)?.id
            ?? restored.nodes?.find((node) => node.type === 'FRAME')?.id ?? saved.frameId;
          if (!cancelled) setAccepted(saved.accepted === true);
        }
        const draft = await rpc('snapshot', { frameId: currentFrame.current });
        if (isSnapshot(draft)) {
          currentFrame.current = draft.frameId;
          if (!cancelled) setHasFrame(!!draft.frameId);
        }
        if (!cancelled && ownEpoch === epoch) { setConnected(true); setError(''); void poll(ownEpoch); }
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : '设计恢复失败'); }
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== editorOrigin() || event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object' || event.data.channel !== proposal.sessionId) return;
      if (event.data.type === 'magic-resume:ready' && instanceId !== (event.data.instanceId ?? 'legacy')) {
        instanceId = event.data.instanceId ?? 'legacy'; epoch++;
        clearTimeout(timer); setConnected(false); online.current = true;
        for (const waiting of pending.current.values()) { clearTimeout(waiting.timer); waiting.reject(new Error('画布正在重新连接')); }
        pending.current.clear();
        void initialize(epoch);
      } else if (event.data.type === 'magic-resume:result' && typeof event.data.id === 'string') {
        const waiting = pending.current.get(event.data.id);
        if (!waiting) return;
        clearTimeout(waiting.timer); pending.current.delete(event.data.id);
        if (event.data.ok === true) waiting.resolve(event.data.result); else waiting.reject(new Error(typeof event.data.error === 'string' ? event.data.error : 'OpenPencil 操作失败'));
      }
    };
    window.addEventListener('message', receive);
    const hello = setInterval(() => { frame.current?.contentWindow?.postMessage({ type: 'magic-resume:hello' }, editorOrigin()); }, 800);
    const requests = pending.current;
    return () => {
      cancelled = true; clearTimeout(timer); clearInterval(hello); online.current = false; loaded.current = () => {};
      window.removeEventListener('message', receive);
      for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error('设计面板已关闭')); }
      requests.clear();
    };
  }, [proposal.sessionId, proposal.sourceHash, resume.id, rpc]);

  async function bundle() {
    const result = await rpc('bundle', { frameId: currentFrame.current ?? proposal.frameId, args: { frameIds: currentFrames.current } });
    if (!isBundle(result)) throw new Error('设计导出结果不完整');
    return { ...result, frameId: result.frameId ?? currentFrame.current ?? proposal.frameId, sourceHash: proposal.sourceHash };
  }
  async function save() {
    setBusy(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ info: resume.info, sections: resume.sections })));
      const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
      if (hash !== proposal.sourceHash) throw new Error('原简历已变化，请重新生成设计');
      const draft = await rpc('snapshot', { frameId: currentFrame.current ?? proposal.frameId });
      if (!isSnapshot(draft)) throw new Error('设计保存结果不完整');
      const value = { ...draft, frameIds: currentFrames.current, pdf: '', sourceHash: proposal.sourceHash, accepted: true };
      await dbClient.setItem(`openpencil-design:${resume.id}:${proposal.sessionId}`, value);
      await dbClient.setItem(`openpencil-design:${resume.id}`, value);
      setAccepted(true); toast.success('设计已保存到本机');
    } catch (error) { reportFrontendError({error,component:'storage',category:'operation',code:'canvas_save_failed'}); toast.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }
  async function download(kind: 'pdf' | 'fig') {
    if (portraitBusy) return;
    setBusy(true);
    try {
      const value = await bundle();
      const bytes = Uint8Array.from(atob(value[kind]), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: kind === 'pdf' ? 'application/pdf' : 'application/octet-stream' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${resume.info.fullName.trim() || '简历'}-设计.${kind}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { reportFrontendError({error,component:'export',category:'operation',code:'canvas_export_failed'}); toast.error(error instanceof Error ? error.message : '导出失败'); }
    finally { setBusy(false); }
  }
  return <section className={`${styles.studio} ${styles.pencilStudio}`} aria-label="OpenPencil 简历设计工作台">
    <header className={styles.header} hidden><div><strong>简历设计</strong><span>OpenPencil · {connected ? accepted ? '已保存到本机' : '可编辑画布' : '连接中'}</span></div><button type="button" aria-label="关闭设计工作台" disabled={proposal.status === 'working'} onClick={onClose}>×</button></header>
    <div className={styles.actions}><button type="button" disabled={!connected || busy || portraitBusy || !hasFrame} onClick={() => { void save(); }}>{accepted ? '保存设计' : '保存草稿'}</button><button type="button" disabled={!connected || busy || portraitBusy || !hasFrame} onClick={() => { void download('pdf'); }}>导出 PDF</button><button type="button" disabled={!connected || busy || portraitBusy || !hasFrame} onClick={() => { void download('fig'); }}>下载设计源文件</button><button type="button" disabled={!connected} onClick={() => { void rpc('panels').catch(() => toast.error('面板切换失败')); }}>图层与属性</button>{(attachmentKey || resume.info.avatar) && <button type="button" disabled={!connected || !hasFrame || portraitBusy || runActive} onClick={() => setPortraitRetry(value => value + 1)}>{t(portraitBusy ? "aiLab.design.portraitRestoring" : "aiLab.design.restorePortrait")}</button>}</div>
    {portraitNotice && <p role="status" className="px-4 py-2 text-xs text-mr-ink-secondary">{portraitNotice}</p>}
    <div className={styles.body}><div className={styles.pencilCanvas}><iframe ref={frame} onLoad={() => loaded.current()} src={`${EDITOR_URL}/?magic_resume=${proposal.sessionId}`} title="OpenPencil 可编辑简历画布" allow="clipboard-read; clipboard-write" />{error && <p role="alert">{error}</p>}</div><aside className={styles.process} aria-label="设计过程"><h2>实际执行</h2>{proposal.steps.map((step, index) => <div key={`${index}-${step.title}`} className={styles.step} data-status={step.status}><span className={styles.dot}>{step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : '·'}</span><div><h3>{step.title}</h3><p>{step.detail}</p></div></div>)}{proposal.review && <div className={styles.summary}>{proposal.review}</div>}<details className={styles.basis}><summary>岗位依据与设计方向</summary><p className={styles.rationale}>{proposal.rationale}</p></details></aside></div>
  </section>;
}
