'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { compile, renderTreeNodeDom, validateTemplate, type TemplateDocument } from '@magic-resume-kit/resume-templates';
import type { WidgetProps } from '@magic-resume/genui';
import { useResumeDocumentStore } from '@/store/resume/document';
import type { Resume } from '@/types/frontend/resume';
import { exportResumeToPdf } from '@/lib/utils/pdf-export';
import { designCandidate } from '@/lib/ai/designCandidate';
import { toast } from 'sonner';
import styles from './design-studio.module.css';
import OpenPencilStudio, { type PencilProposal } from './OpenPencilStudio';
import type { CanvasReviewAnnotations, CanvasAnnotationStatus } from '../evaluation/canvasAnnotations';

export interface KitDesignProposal {
  status: 'working' | 'ready' | 'failed';
  template: TemplateDocument;
  sourceHash: string;
  version: number;
  spec: { direction: string; rationale: string; ink: string; accent: string; tint: string; decisions: Array<{ zone: string; reason: string }> };
  steps: Array<{ title: string; detail: string; status: 'running' | 'completed' | 'failed' }>;
  metrics?: { pages: number; height: number; overflow: boolean };
  review?: { completed: boolean; summary: string; needsAdjustment: boolean };
}
export type DesignProposal = KitDesignProposal | PencilProposal;
export function asDesignProposal(value: Record<string, unknown>): DesignProposal | null {
  if (value.engine === 'openpencil' && typeof value.sessionId === 'string' && typeof value.sourceHash === 'string' && Array.isArray(value.steps)) return value as unknown as PencilProposal;
  return value.template && typeof value.template === 'object' && Array.isArray(value.steps) && value.spec && typeof value.spec === 'object' && typeof value.sourceHash === 'string' && ['working', 'ready', 'failed'].includes(String(value.status)) ? value as unknown as DesignProposal : null;
}

export function DesignProposalCard({ instance }: WidgetProps) {
  const proposal = asDesignProposal(instance.props);
  if (!proposal) return null;
  return <div className={styles.card}><strong>{'engine' in proposal ? '简历画布' : proposal.status === 'ready' ? '设计方案已生成' : proposal.status === 'failed' ? '设计需要继续修正' : '正在设计简历'}</strong><p>{'engine' in proposal ? proposal.rationale : proposal.spec.rationale}</p><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('resume-design:open', { detail: { widgetId: instance.widgetId } }))}>{'engine' in proposal ? '打开设计画布' : '查看设计与过程'}</button></div>;
}

export default function DesignStudio({ proposal, resume, onClose, annotations, onAnnotationStatus, attachmentKey, runActive }: { proposal: DesignProposal; resume: Resume; onClose: () => void; annotations?: CanvasReviewAnnotations; onAnnotationStatus?: (status: CanvasAnnotationStatus) => void; attachmentKey?: string; runActive?: boolean }) {
  return 'engine' in proposal ? <OpenPencilStudio proposal={proposal} resume={resume} onClose={onClose} annotations={annotations} onAnnotationStatus={onAnnotationStatus} attachmentKey={attachmentKey} runActive={runActive} /> : <KitDesignStudio proposal={proposal} resume={resume} onClose={onClose} />;
}

function KitDesignStudio({ proposal, resume, onClose }: { proposal: KitDesignProposal; resume: Resume; onClose: () => void }) {
  const updateResume = useResumeDocumentStore((state) => state.updateResume);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(.6);
  const [selected, setSelected] = useState<string>();
  const viewport = useRef<HTMLDivElement>(null);
  const [previous, setPrevious] = useState<Pick<Resume, 'templateOverride' | 'typography' | 'customTemplate'> | null>(null);
  const validation = useMemo(() => validateTemplate(proposal.template), [proposal.template]);
  const compiled = useMemo(() => validation.ok ? compile(proposal.template, resume) : null, [proposal.template, resume, validation.ok]);
  const applied = JSON.stringify(resume.templateOverride) === JSON.stringify(proposal.template);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, Math.max(.28, (element.clientWidth - 30) / 794))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const apply = async () => {
    const source = JSON.stringify({ info: resume.info, sections: resume.sections });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    if (hash !== proposal.sourceHash) { toast.error('原简历已变更，请重新生成设计，避免覆盖新内容。'); return; }
    setPrevious({ templateOverride: resume.templateOverride, typography: resume.typography, customTemplate: resume.customTemplate });
    updateResume(resume.id, designCandidate(resume, proposal.template));
    toast.success('已采纳设计，可继续编辑或导出。');
  };
  const download = async () => {
    setBusy(true);
    try { await exportResumeToPdf(designCandidate(resume, proposal.template)); }
    catch { toast.error('PDF 导出失败，请重试。'); }
    finally { setBusy(false); }
  };
  const targetIds: Record<string, string> = { identity: 'design-identity', projects: 'design-projects', experience: 'design-experience', support: 'design-support' };
  return <section className={styles.studio} aria-label="简历设计工作台">
    <header className={styles.header}><div><strong>简历设计</strong><span>第 {proposal.version} 版 · {applied ? '已采纳' : proposal.status === 'ready' ? '待审阅' : proposal.status === 'failed' ? '待修正' : '执行中'}</span></div><button type="button" onClick={onClose} aria-label="关闭设计工作台">×</button></header>
    <div className={styles.actions}><button type="button" disabled={proposal.status !== 'ready' || !validation.ok || applied} onClick={() => { void apply(); }}>{applied ? '已采纳设计' : '采纳此设计'}</button><button type="button" disabled={proposal.status !== 'ready' || busy} onClick={() => { void download(); }}>{busy ? '正在导出…' : '导出 PDF'}</button>{applied && previous && <button type="button" onClick={() => { updateResume(resume.id, previous); setPrevious(null); }}>撤回设计</button>}</div>
    <div className={styles.body}><div className={styles.preview} ref={viewport}><div style={{ width: 794 * scale, height: Math.max(1123, proposal.metrics?.height ?? 1123) * scale, position: 'relative', margin: '18px auto' }}><div className={styles.paper} style={{ transform: `scale(${scale})` }}>{compiled?.root ? renderTreeNodeDom(compiled.root, { design: { selectedId: selected } }) : <p>模板检查未通过，暂不显示预览。</p>}</div></div></div>
      <aside className={styles.process} aria-label="设计过程"><h2>实际执行</h2>{proposal.steps.map((step, index) => <div className={styles.step} key={`${index}-${step.title}`} data-status={step.status}><span className={styles.dot}>{step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : '·'}</span><div><h3>{step.title}</h3><p>{step.detail}</p></div></div>)}{proposal.metrics && <div className={styles.summary}>{proposal.metrics.pages} 页 A4 · 内容 {proposal.metrics.height}px<br />{proposal.review?.completed ? '已完成实际页面视觉评审' : '视觉评审尚未完成'}</div>}<details className={styles.basis}><summary>查看岗位依据与设计决策</summary><p className={styles.rationale}>{proposal.spec.rationale}</p>{proposal.spec.decisions.map((decision, index) => <button key={`${decision.zone}-${index}`} className={styles.decision} type="button" onClick={() => setSelected(targetIds[decision.zone])}><span>{decision.reason}</span><small>定位这处设计</small></button>)}</details></aside>
    </div>
  </section>;
}
