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

export interface Announcement {
  readonly id: number;
  readonly text: string;
  readonly urgent: boolean;
}

interface NoticesState {
  notices: readonly Notice[];
  /** The last message for screen readers. Dismissing a toast does not change it. */
  announcement: Announcement | null;
  notify: (tone: NoticeTone, title: string, detail?: string) => number;
  dismiss: (id: number) => void;
  /** Tell screen readers something without showing a toast. */
  announce: (text: string) => void;
}

let nextId = 1;

export const useNotices = create<NoticesState>()((set) => ({
  notices: [],
  announcement: null,
  notify: (tone, title, detail) => {
    const id = nextId++;
    set((state) => ({
      notices: [...state.notices.slice(-4), { id, tone, title, ...(detail ? { detail } : {}) }],
      announcement: { id, text: detail ? `${title}. ${detail}` : title, urgent: tone === "error" },
    }));
    return id;
  },
  announce: (text) => set({ announcement: { id: nextId++, text, urgent: false } }),
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
}));

export const notify = (tone: NoticeTone, title: string, detail?: string) =>
  useNotices.getState().notify(tone, title, detail);

export const announce = (text: string) => useNotices.getState().announce(text);
