'use client';

import { X } from '@magic-resume-kit/icons';
import { useTranslation } from 'react-i18next';
import type { PendingInput } from '../lib/pendingInputs';
import { SKILLS } from '../skills/registry';

export default function PendingInputs({ items, paused, onSendNow, onRemove, onResume }: {
  items: PendingInput[]; paused: boolean;
  onSendNow: (id: string) => void; onRemove: (id: string) => void; onResume: () => void;
}) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return <section aria-label={t('aiLab.queue.title')} className="mx-auto mb-1 w-full max-w-3xl px-4">
    <div className="rounded-xl border border-mr-line bg-mr-surface p-2 text-xs">
      <div className="flex items-center justify-between gap-3 px-1 py-1 text-mr-ink-secondary" aria-live="polite">
        <span>{t('aiLab.queue.count', { count: items.length })} · {t(paused ? 'aiLab.queue.paused' : 'aiLab.queue.waiting')}</span>
        {paused && <button type="button" className="shrink-0 underline" onClick={onResume}>{t('aiLab.queue.resume')}</button>}
      </div>
      <ol className="max-h-40 overflow-y-auto">
        {items.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-lg px-1 py-2" data-queued-input={item.id}>
          <div className="min-w-0 flex-1"><p className="line-clamp-2 whitespace-pre-wrap break-words text-mr-ink">{item.text || (item.kind === 'skill' ? SKILLS[item.skillId].name : item.kind === 'targeted' ? item.quote.label : item.attachments?.map((file) => file.name).join('、'))}</p>
            <p className="mt-1 text-[10px] text-mr-ink-secondary">{t(`aiLab.mode.${item.agentMode}.name`)}{item.kind === 'chat' && item.text && item.attachments?.length ? ` · ${item.attachments.map((file) => file.name).join('、')}` : ''}</p>
          </div>
          <button type="button" onClick={() => onSendNow(item.id)} className="shrink-0 rounded-md border border-mr-line px-2 py-1 text-mr-ink hover:bg-mr-surface-soft">{t('aiLab.queue.sendNow')}</button>
          <button type="button" aria-label={t('aiLab.queue.remove')} onClick={() => onRemove(item.id)} className="shrink-0 rounded p-1 text-mr-ink-secondary hover:bg-mr-surface-soft"><X size={13} /></button>
        </li>)}
      </ol>
    </div>
  </section>;
}
