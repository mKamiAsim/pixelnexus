/**
 * Short messages for the person using the app. Each one is shown as a toast and read out by
 * screen readers through a live region.
 */
import { create } from "zustand";

export type NoticeTone = "info" | "success" | "warning" | "error";

export interface Notice {
  readonly id: number;
  readonly tone: NoticeTone;
  readonly title: string;
  readonly detail?: string;
}

interface NoticesState {
  notices: readonly Notice[];
  notify: (tone: NoticeTone, title: string, detail?: string) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useNotices = create<NoticesState>()((set) => ({
  notices: [],
  notify: (tone, title, detail) => {
    const id = nextId++;
    set((state) => ({
      notices: [...state.notices.slice(-4), { id, tone, title, ...(detail ? { detail } : {}) }],
    }));
    return id;
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
}));

export const notify = (tone: NoticeTone, title: string, detail?: string) =>
  useNotices.getState().notify(tone, title, detail);
