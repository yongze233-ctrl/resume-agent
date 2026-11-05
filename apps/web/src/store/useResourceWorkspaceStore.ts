'use client';
import { create } from 'zustand';
import type { ResourceTarget } from '@/app/dashboard/_components/learning/workspaceTarget';

interface ResourceWorkspaceState {
  byResume: Record<string, { open: boolean; target: ResourceTarget }>;
  open: (resumeId: string, target?: ResourceTarget) => void;
  close: (resumeId: string) => void;
}
/** View state only; no navigation, model call, credentials or resume content. */
export const useResourceWorkspaceStore = create<ResourceWorkspaceState>(
  (set) => ({
    byResume: {},
    open: (resumeId, target) =>
      set((state) => ({
        byResume: {
          ...state.byResume,
          [resumeId]: {
            open: true,
            target: target ??
              state.byResume[resumeId]?.target ?? { view: 'courses' },
          },
        },
      })),
    close: (resumeId) =>
      set((state) =>
        state.byResume[resumeId]
          ? {
              byResume: {
                ...state.byResume,
                [resumeId]: { ...state.byResume[resumeId], open: false },
              },
            }
          : state,
      ),
  }),
);
