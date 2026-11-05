'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useResumeDocumentStore } from '@/store/resume/document';
import { useAiSessionStore, type AiSessionSnapshot } from '@/store/useAiSessionStore';
import type { Resume } from '@/types/frontend/resume';
import { dbClient } from '@/lib/api/IndexDBClient';

/** Imports only the explicitly generated fictional evaluation, never another user's data. */
export default function EvaluationReplayPage() {
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const engine = new URLSearchParams(window.location.search).get('engine');
      const response = await fetch(engine === 'openpencil' ? '/evaluation/openpencil-flow.json' : '/evaluation/design-flow.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Evaluation is not ready');
      const result = await response.json() as { fictionalTest: boolean; resume: Resume; session: AiSessionSnapshot; openPencil?: { sessionId: string; bundle: { fig: string; pdf: string; sourceHash: string; frameId: string; accepted: boolean } } };
      if (result.fictionalTest !== true || !result.resume?.id?.startsWith('design-evaluation-')) throw new Error('Invalid evaluation');
      if (!active) return;
      await useResumeDocumentStore.getState().addResume(result.resume);
      const design = result.openPencil;
      if (design && /^[a-f0-9-]{36}$/.test(design.sessionId) && typeof design.bundle?.fig === 'string' && typeof design.bundle.pdf === 'string') {
        // Reopening this fictional example preserves any local canvas edits.
        const key = `openpencil-design:${result.resume.id}:${design.sessionId}`;
        if (!await dbClient.getItem(key)) {
          await dbClient.setItem(key, design.bundle);
          await dbClient.setItem(`openpencil-design:${result.resume.id}`, design.bundle);
        }
      }
      const sessions = useAiSessionStore.getState();
      // Existing local edits/history win on repeated opens.
      const saved = await sessions.loadSession(result.resume.id);
      if (!saved.messages.length) {
        sessions.adoptSession(result.resume.id, result.session);
        await sessions.flushSession(result.resume.id);
      }
      if (active) router.replace(`/dashboard/chat/${encodeURIComponent(result.resume.id)}`);
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [router]);
  return <main className="grid flex-1 place-items-center text-sm text-mr-ink-secondary">{error ? <div>测试结果尚未就绪。<button type="button" onClick={() => router.push('/dashboard')} className="ml-3 underline">返回对话</button></div> : <p role="status">正在载入真实测试记录与设计方案…</p>}</main>;
}
