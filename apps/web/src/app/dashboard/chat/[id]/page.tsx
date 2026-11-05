'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useResumeDocumentStore } from '@/store/resume/document';
import { useResumeEditorUiStore } from '@/store/resume/editor-ui';
import AiChatShell from '../../edit/_components/ai/AiChatShell';
import ResumeMissing, { useResumeMissing } from '../../edit/_components/ResumeMissing';
import AgentScaffold from '../../_components/AgentScaffold';
import styles from '../../_components/agent-home.module.css';

export default function AgentConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const missing = useResumeMissing(id);
  const { activeResume, loadResumeForEdit, updateSections, updateInfo, applyFullResume, applyWorkspaceResolution } = useResumeDocumentStore();
  const setIsAiGenerating = useResumeEditorUiStore((state) => state.setIsAiGenerating);
  useEffect(() => {
    if (id && activeResume?.id !== id) loadResumeForEdit(id);
  }, [id, activeResume?.id, loadResumeForEdit]);

  return <AgentScaffold>
    {missing ? <ResumeMissing /> : activeResume?.id === id ? <div className="h-full min-h-0" data-agent-chat><AiChatShell resumeData={activeResume} templateId={activeResume.template || 'classic'} headerTitle="Resume Agent" onClose={() => router.push('/dashboard')} onApplySections={updateSections} onApplyInfo={updateInfo} onApplyFullResume={applyFullResume} onApplyWorkspaceResolution={applyWorkspaceResolution} setIsAiJobRunning={setIsAiGenerating} /></div> : <div className={styles.loading} role="status">正在恢复对话…</div>}
  </AgentScaffold>;
}
