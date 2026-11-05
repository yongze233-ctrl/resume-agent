import { create } from 'zustand';
import type { StagedAttachment } from '../app/dashboard/edit/_components/ai/lib/attachments';

export interface AgentEntryMessage {
  text: string;
  attachments?: StagedAttachment[];
}

interface AgentEntryState {
  pending: Record<string, AgentEntryMessage>;
  queue: (resumeId: string, message: AgentEntryMessage) => void;
  take: (resumeId: string) => AgentEntryMessage | undefined;
}

/** First-message handoff stays in memory: no resume text or attachment URLs in navigation. */
export const createAgentEntryStore = () => create<AgentEntryState>((set, get) => ({
  pending: {},
  queue: (resumeId, message) => set((state) => ({ pending: { ...state.pending, [resumeId]: message } })),
  take: (resumeId) => {
    const message = get().pending[resumeId];
    if (!message) return undefined;
    set((state) => {
      const pending = { ...state.pending };
      delete pending[resumeId];
      return { pending };
    });
    return message;
  },
}));

export const useAgentEntryStore = createAgentEntryStore();
