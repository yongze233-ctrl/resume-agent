'use client';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { dbClient } from '@/lib/api/IndexDBClient';

export interface LearningAttempt {
  answers: number[];
  correct: boolean;
  at: string;
}
export interface LearningExam {
  id: string;
  correct: number;
  total: number;
  at: string;
}
interface Progress {
  completed: Record<string, string>;
  bookmarks: string[];
  notes: Record<string, string>;
  attempts: Record<string, LearningAttempt>;
  exams: LearningExam[];
  markRead: (id: string) => void;
  bookmark: (id: string) => void;
  saveNote: (id: string, text: string) => void;
  answer: (id: string, answers: number[], correct: boolean) => void;
  finishExam: (correct: number, total: number) => void;
}
export const useLearningProgress = create<Progress>()(
  persist(
    (set) => ({
      completed: {},
      bookmarks: [],
      notes: {},
      attempts: {},
      exams: [],
      markRead: (id) =>
        set((state) => ({
          completed: { ...state.completed, [id]: new Date().toISOString() },
        })),
      bookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(id)
            ? state.bookmarks.filter((item) => item !== id)
            : [...state.bookmarks, id],
        })),
      saveNote: (id, text) =>
        set((state) => ({
          notes: { ...state.notes, [id]: text.slice(0, 20000) },
        })),
      answer: (id, answers, correct) =>
        set((state) => ({
          attempts: {
            ...state.attempts,
            [id]: { answers, correct, at: new Date().toISOString() },
          },
        })),
      finishExam: (correct, total) =>
        set((state) => ({
          exams: [
            ...state.exams,
            {
              id: crypto.randomUUID(),
              correct,
              total,
              at: new Date().toISOString(),
            },
          ].slice(-50),
        })),
    }),
    {
      name: 'learning-progress:v2',
      storage: createJSONStorage(() => ({
        getItem: (key) => dbClient.getItem<string>(key),
        setItem: (key, value) => dbClient.setItem(key, value),
        removeItem: (key) => dbClient.removeItem(key),
      })),
      partialize: ({ completed, bookmarks, notes, attempts, exams }) => ({
        completed,
        bookmarks,
        notes,
        attempts,
        exams,
      }),
    },
  ),
);
