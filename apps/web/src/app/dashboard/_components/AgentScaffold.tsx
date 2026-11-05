'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Settings, Plus, X } from '@magic-resume-kit/icons';
import { useResumeDocumentStore } from '@/store/resume/document';
import { useAiSessionStore } from '@/store/useAiSessionStore';
import { useSettingsUiStore } from '@/store/useSettingsUiStore';
import { useSidebarResize } from './useSidebarResize';
import AccountSession from '@/components/accounts/AccountSession';
import styles from './agent-home.module.css';

function ConversationStatus({ resumeId }: { resumeId: string }) {
  const status = useAiSessionStore((state) => {
    const session = state.sessions[resumeId];
    if (session?.running) return 'running';
    const messages = session?.messages ?? [];
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === 'user') break;
      if ((message.interruptSlot && message.widget?.status === 'pending' && !message.interruptDecision)
        || message.approvals?.some((approval) => approval.status === 'pending')) return 'waiting';
    }
    return 'idle';
  });
  if (status === 'idle') return null;
  const label = status === 'running' ? '正在处理' : '等待回复';
  return <span className={styles.historyStatus} role="status" aria-label={label} title={label}>
    <span className={status === 'running' ? styles.historySpinner : styles.historyWaiting} aria-hidden="true" />
  </span>;
}

export default function AgentScaffold({
  children,
  onNew,
}: {
  children: ReactNode;
  onNew?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { resumes, loadResumes } = useResumeDocumentStore();
  const openSettings = useSettingsUiStore((state) => state.openSettings);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const sidebar = useSidebarResize();
  useEffect(() => {
    void loadResumes().catch(() => setLoadError(true));
  }, [loadResumes]);

  const newConversation = () => {
    setMobileOpen(false);
    if (pathname === '/dashboard' && onNew) onNew();
    else router.push('/dashboard');
  };

  return (
    <div
      className={`${styles.shell} ${sidebar.dragging ? styles.resizing : ''}`}
      style={{ '--agent-sidebar-width': `${sidebar.width}px` } as CSSProperties}
    >
      <button
        className={styles.mobileToggle}
        type="button"
        aria-label="打开导航"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {mobileOpen && (
        <button
          type="button"
          className={styles.scrim}
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}
        aria-label="对话导航"
      >
        <div className={styles.brand}>
          <Link href="/dashboard">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 3h10l4 4v14H5V3Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M9 10h6M9 14h6M9 18h3M15 3v4h4"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            <span>Resume Agent</span>
          </Link>
          <button
            type="button"
            className={styles.mobileClose}
            aria-label="收起导航"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <button
          className={styles.newChat}
          type="button"
          onClick={newConversation}
        >
          <Plus size={17} />
          新对话
        </button>
        <div className={styles.historyLabel}>最近对话</div>
        <nav className={styles.history} aria-label="最近对话">
          {resumes
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((resume) => (
              <Link
                key={resume.id}
                href={`/dashboard/chat/${encodeURIComponent(resume.id)}`}
                className={`${styles.historyItem} ${pathname === `/dashboard/chat/${resume.id}` ? styles.historyActive : ''}`}
                title={resume.name}
                onClick={() => setMobileOpen(false)}
              >
                <span className={styles.historyName}>{resume.name || '未命名对话'}</span>
                <ConversationStatus resumeId={resume.id} />
              </Link>
            ))}
          {!resumes.length && !loadError && (
            <p className={styles.emptyHistory}>开始后，对话会保存在这里。</p>
          )}
          {loadError && (
            <button
              className={styles.retry}
              type="button"
              onClick={() => {
                void loadResumes()
                  .then(() => setLoadError(false))
                  .catch(() => setLoadError(true));
              }}
            >
              加载失败，点击重试
            </button>
          )}
        </nav>
        <div className={styles.sidebarBottom}>
          <button type="button" onClick={() => openSettings('model')}>
            <Settings size={17} />
            模型与设置
          </button>
          <AccountSession />
        </div>
        <div
          {...sidebar.separatorProps}
          className={styles.sidebarResize}
        />
      </aside>
      {sidebar.dragging && <div className={styles.resizeShield} aria-hidden="true" />}
      <div className={styles.content}>
        <div className={styles.workspace}>{children}</div>
      </div>
    </div>
  );
}
