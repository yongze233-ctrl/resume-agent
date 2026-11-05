'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, FileText, Search, X } from '@magic-resume-kit/icons';
import type { Resume } from '@/types/frontend/resume';
import styles from './agent-home.module.css';

/** A secondary workspace view; the conversation stays mounted underneath. */
export default function ResumeLibraryPanel({ resumes, currentId, onClose, onOpen }: {
  resumes: Resume[];
  currentId?: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => resumes
    .filter((resume) => `${resume.name} ${resume.info.fullName} ${resume.info.headline}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt), [query, resumes]);

  return <section className={styles.libraryPanel} aria-labelledby="resume-library-title" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <header className={styles.libraryHeader}>
      <button type="button" onClick={onClose}><ArrowLeft size={16} />返回对话</button>
      <button type="button" onClick={onClose} aria-label="关闭我的简历"><X size={19} /></button>
    </header>
    <div className={styles.libraryBody}>
      <div className={styles.libraryHeading}><div><h1 id="resume-library-title">我的简历</h1><p>{resumes.length} 份简历</p></div>
        <label className={styles.librarySearch}><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索简历" placeholder="搜索简历" /><kbd>Esc</kbd></label>
      </div>
      <div className={styles.libraryList}>
        {visible.map((resume) => <button type="button" key={resume.id} className={styles.libraryResume} onClick={() => onOpen(resume.id)}>
          <span className={styles.libraryIcon}><FileText size={22} /></span>
          <span className={styles.libraryResumeInfo}><strong>{resume.name || '未命名简历'}</strong><span>{[resume.info.fullName, resume.info.headline].filter(Boolean).join(' · ') || '继续完善内容与设计'}</span></span>
          <span className={styles.libraryDate}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(resume.updatedAt)}</span>
          <span className={styles.libraryOpen}>{resume.id === currentId ? '返回编辑' : '打开'}</span>
        </button>)}
        {!visible.length && <div className={styles.libraryEmpty}><FileText size={30} /><h2>{query ? '没有找到匹配的简历' : '还没有简历'}</h2><p>{query ? '试试其他名称或岗位关键词。' : '回到对话，上传简历或描述你的经历即可开始。'}</p></div>}
      </div>
    </div>
  </section>;
}
