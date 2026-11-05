'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAiSessionStore } from '@/store/useAiSessionStore';
import type { Resume } from '@/types/frontend/resume';
import type {
  EvaluationProgress,
  MultiPersonaResumeAnalysis,
} from '@/types/agent/multi-persona';
import {
  frameReviewKey,
  readReviewTargets,
  requestReviewCanvas,
  type FrameReview,
  type ReviewBatch,
  type ReviewTarget,
} from './reviewTargets';
import { reviewActive } from './reviewModel';

export function useReviewWorkspace(
  resumeId: string,
  designId: string | undefined,
) {
  const session = useAiSessionStore((state) => state.sessions[resumeId]);
  const [catalog, setCatalog] = useState<{
    designId: string;
    targets: ReviewTarget[];
  } | null>(null);
  const [selection, setSelection] = useState<{
    designId: string;
    ids: string[];
  } | null>(null);
  const [batch, setBatch] = useState<ReviewBatch | null>(null);
  const current = useRef<FrameReview | null>(null);
  const targets = useMemo(
    () => (catalog && catalog.designId === designId ? catalog.targets : []),
    [catalog, designId],
  );
  const savedIds =
    session?.evaluationSelection &&
    session.evaluationSelection.designId === designId
      ? session.evaluationSelection.ids
      : null;
  const selectedIds = (
    (selection && selection.designId === designId ? selection.ids : savedIds) ??
    targets.map((target) => target.id)
  ).filter((id) => targets.some((target) => target.id === id));
  const viewId =
    session?.evaluationView && session.evaluationView.designId === designId
      ? session.evaluationView.frameId
      : undefined;
  const viewedTarget =
    targets.find((target) => target.id === viewId) ?? targets[0] ?? null;
  const records = session?.evaluationFrameReviews ?? {};
  const rawRecord =
    designId && viewedTarget
      ? (records[frameReviewKey(designId, viewedTarget.id)] ?? null)
      : null;
  const viewedRecord =
    rawRecord && !batch && reviewActive(rawRecord.progress)
      ? {
          ...rawRecord,
          progress: { ...rawRecord.progress!, phase: 'stopped' as const },
        }
      : rawRecord;

  const discover = useCallback(
    async (signal?: AbortSignal) => {
      if (!designId) return [];
      const list = await readReviewTargets(resumeId, designId, signal);
      if (!list.length)
        throw new Error('画布中没有可评估的简历画板，请先完成简历内容。');
      setCatalog({ designId, targets: list });
      const store = useAiSessionStore.getState();
      const savedView = store.ensureSession(resumeId).evaluationView;
      const target =
        list.find(
          (item) =>
            savedView?.designId === designId && item.id === savedView.frameId,
        ) ?? list[0];
      store.patchSession(resumeId, {
        evaluationView: { designId, frameId: target.id },
      });
      await requestReviewCanvas(resumeId, 'focus', signal, {
        sessionId: designId,
        frameId: target.id,
      });
      return list;
    },
    [designId, resumeId],
  );

  const save = useCallback(
    (record: FrameReview) => {
      const store = useAiSessionStore.getState(),
        previous = store.ensureSession(resumeId);
      store.patchSession(resumeId, {
        evaluationFrameReviews: {
          ...previous.evaluationFrameReviews,
          [frameReviewKey(record.designId, record.target.id)]: record,
        },
      });
    },
    [resumeId],
  );
  const recordProgress = useCallback(
    (progress: EvaluationProgress) => {
      if (!current.current) return;
      current.current = { ...current.current, progress };
      save(current.current);
    },
    [save],
  );
  const recordReport = useCallback(
    (analysis: MultiPersonaResumeAnalysis) => {
      if (!current.current) return;
      current.current = {
        ...current.current,
        analysis,
        error: undefined,
        progress: { phase: 'complete', completed: 3, total: 3 },
      };
      save(current.current);
    },
    [save],
  );
  const beginFrame = useCallback(
    (target: ReviewTarget, index: number, total: number) => {
      if (!designId) return;
      const store = useAiSessionStore.getState(),
        snapshot = store.ensureSession(resumeId);
      const previous =
        snapshot.evaluationFrameReviews?.[frameReviewKey(designId, target.id)];
      current.current = {
        ...previous,
        designId,
        target,
        reviewKey: crypto.randomUUID(),
        analysis: previous?.analysis ?? null,
        progress: { phase: 'reading', completed: 0, total: 3 },
        error: undefined,
      };
      save(current.current);
      store.patchSession(resumeId, {
        evaluationView: { designId, frameId: target.id },
      });
      setBatch({ index, total, targetName: target.name });
    },
    [designId, resumeId, save],
  );
  const setSource = useCallback(
    (source: Resume) => {
      if (!current.current) return;
      current.current = { ...current.current, source };
      save(current.current);
    },
    [save],
  );
  const finishFrame = useCallback(
    (error?: string, stopped = false) => {
      if (!current.current) return;
      if (error || reviewActive(current.current.progress)) {
        const previous = current.current.progress;
        current.current = {
          ...current.current,
          error,
          progress: {
            ...previous,
            phase: stopped ? 'stopped' : 'failed',
            completed: previous?.completed ?? 0,
            total: 3,
          },
        };
        save(current.current);
      }
    },
    [save],
  );
  const finishBatch = useCallback(() => {
    current.current = null;
    setBatch(null);
  }, []);
  const confirmSelection = useCallback(
    (ids: string[]) => {
      if (designId)
        useAiSessionStore
          .getState()
          .patchSession(resumeId, { evaluationSelection: { designId, ids } });
    },
    [designId, resumeId],
  );
  const toggleTarget = useCallback(
    (id: string) => {
      if (designId)
        setSelection({
          designId,
          ids: selectedIds.includes(id)
            ? selectedIds.filter((value) => value !== id)
            : [...selectedIds, id],
        });
    },
    [designId, selectedIds],
  );
  const selectAll = useCallback(() => {
    if (designId)
      setSelection({
        designId,
        ids:
          selectedIds.length === targets.length
            ? []
            : targets.map((target) => target.id),
      });
  }, [designId, selectedIds.length, targets]);
  const view = useCallback(
    async (target: ReviewTarget) => {
      if (!designId) return;
      useAiSessionStore.getState().patchSession(resumeId, {
        evaluationView: { designId, frameId: target.id },
      });
      await requestReviewCanvas(resumeId, 'focus', undefined, {
        sessionId: designId,
        frameId: target.id,
      });
    },
    [designId, resumeId],
  );

  return {
    targets,
    selectedIds,
    viewedTarget,
    viewedRecord,
    records,
    batch,
    current,
    discover,
    beginFrame,
    setSource,
    recordProgress,
    recordReport,
    finishFrame,
    finishBatch,
    confirmSelection,
    toggleTarget,
    selectAll,
    view,
  };
}
