'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Composer from '../edit/_components/ai/conversation/Composer';
import type { AgentMode } from '../edit/_components/ai/conversation/modes';
import type { SkillId } from '../edit/_components/ai/types';
import type { StagedAttachment } from '../edit/_components/ai/lib/attachments';
import { uploadAttachmentToBackend } from '@/lib/api/attachmentUpload';
import { useResumeDocumentStore } from '@/store/resume/document';
import { useAiSessionStore } from '@/store/useAiSessionStore';
import { useAgentEntryStore, type AgentEntryMessage } from '@/store/useAgentEntryStore';
import AgentScaffold from './AgentScaffold';
import styles from './agent-home.module.css';

const skillRequests: Partial<Record<SkillId, string>> = {
  create: '请和我一起从零创建简历，先了解我的目标岗位和已有经历。',
  optimize: '请基于我的原简历和目标岗位优化内容，先确认所需材料。',
  analyze: '请分析我的简历，先确认原简历和目标岗位。',
  fit: '请对照目标岗位分析我的简历匹配情况。',
  translate: '请帮助我翻译简历，先确认目标语言。',
};

export default function AgentHome() {
  const router = useRouter();
  const createResume = useResumeDocumentStore((state) => state.createResume);
  const [mode, setMode] = useState<AgentMode>('cocreate');
  const [busy, setBusy] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [failed, setFailed] = useState<AgentEntryMessage | null>(null);
  const inFlight = useRef(false);
  const createdId = useRef<string | null>(null);

  const begin = async (text: string, attachments?: StagedAttachment[]) => {
    if (inFlight.current || (!text.trim() && !attachments?.length)) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(null);
    const message = { text, attachments };
    try {
      // Opening the homepage never creates an empty resume. Start only after Send.
      const id = createdId.current ?? await createResume(text.trim().split('\n')[0].slice(0, 26) || '简历对话');
      createdId.current = id;
      const sessions = useAiSessionStore.getState();
      sessions.patchSession(id, { agentMode: mode });
      await sessions.flushSession(id);
      useAgentEntryStore.getState().queue(id, message);
      router.push(`/dashboard/chat/${encodeURIComponent(id)}`);
    } catch {
      setFailed(message);
      setBusy(false);
      inFlight.current = false;
    }
  };

  const reset = () => {
    if (inFlight.current) return;
    setComposerKey((key) => key + 1);
    setFailed(null);
    createdId.current = null;
  };

  return <AgentScaffold onNew={reset}>
    <header className={styles.homeHeader}><span>你的简历设计助手</span></header>
    <main className={styles.homeMain}>
      <div className={styles.welcome}>
        <svg className={styles.welcomeMark} width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M11 5h15l5 5v25H11V5Z" stroke="currentColor" strokeWidth="1.7"/><path d="M17 16h8M17 22h8M17 28h4M26 5v6h5" stroke="currentColor" strokeWidth="1.7"/><path d="m5 17-3 3 3 3" stroke="currentColor" strokeWidth="1.7"/></svg>
        <h1>这次想申请什么岗位？</h1>
        <p>上传现有简历，贴上岗位 JD，告诉我你想要的风格。</p>
        <div className={styles.composer}>
          <Composer key={composerKey} mode={mode} onModeChange={setMode} disabled={busy} onSend={(text, attachments) => { void begin(text, attachments); }} onUploadAttachment={uploadAttachmentToBackend} onRunSkill={(id, text) => { void begin(`${skillRequests[id] ?? '请协助我处理简历。'}${text ? `\n\n${text}` : ''}`); }} placeholder="上传简历、粘贴 JD，或者直接说说你想怎么改…" />
        </div>
        {busy && <p className={styles.status} role="status">正在打开对话…</p>}
        {failed && <div className={styles.failure} role="alert"><span>未能保存对话，待发送内容已保留。</span><button type="button" onClick={() => { void begin(failed.text, failed.attachments); }}>重试发送</button></div>}
        <div className={styles.hints}><span>从内容到版式，一起打磨</span><span aria-hidden="true">·</span><span>支持 PDF、Word 和图片，也可以直接粘贴经历</span></div>
      </div>
      <p className={styles.homeNote}>先从一句话开始。你可以在对话中补充材料、调整方向，再查看简历。</p>
    </main>
  </AgentScaffold>;
}
