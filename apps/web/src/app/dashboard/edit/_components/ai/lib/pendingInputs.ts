import type { AgentMode } from '../conversation/modes';
import type { QuoteRect } from '../conversation/quoteHandoff';
import type { ChatMessage, SkillId } from '../types';
import type { StagedAttachment } from './attachments';

export type PendingQuote = {
  id: string; path: string; label: string; text: string;
  selectionText?: string; origin?: QuoteRect | null; motion?: 'full' | 'lite';
};
export type PendingInputPayload =
  | { kind: 'chat'; text: string; attachments?: ChatMessage['attachmentRefs'] }
  | { kind: 'skill'; text: string; skillId: SkillId }
  | { kind: 'targeted'; text: string; quote: PendingQuote };
export type PendingInput = PendingInputPayload & { id: string; agentMode: AgentMode; createdAt: number };

export function pendingAttachmentRefs(attachments?: StagedAttachment[]): ChatMessage['attachmentRefs'] {
  return attachments?.flatMap((item) => item.status === 'ready' && item.stored
    ? [{ id: item.id, name: item.file.name, contentType: item.stored.contentType, key: item.stored.key }] : []);
}

/** Uploaded bytes stay on the backend; only display metadata needs recreating here. */
export function restorePendingAttachments(refs: ChatMessage['attachmentRefs']): StagedAttachment[] {
  return (refs ?? []).map((ref) => ({
    id: ref.id, file: new File([], ref.name, { type: ref.contentType }),
    kind: ref.contentType === 'application/pdf' ? 'pdf' : ref.contentType.startsWith('image/') ? 'image' : 'word', status: 'ready',
    stored: { key: ref.key, filename: ref.name, contentType: ref.contentType },
  }));
}
