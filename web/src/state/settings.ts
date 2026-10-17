/**
 * Preferences that you can change in the studio. They are a per-browser convenience, so they
 * live in localStorage. Storage can be blocked, so every access is guarded and the defaults apply.
 */
import { create } from "zustand";

import { DEFAULT_LIMITS, type ImageLimits } from "@/core/image/limits";

import { HISTORY_BYTES, historyLimits, MAX_STEPS } from "./documents";

const STORAGE_KEY = "pixelnexus.settings.v1";

/** How much history each image keeps: steps after the original, and memory in megabytes. */
export interface HistorySettings {
  readonly steps: number;
  readonly megabytes: number;
}

export interface Settings {
  readonly limits: ImageLimits;
  readonly rulers: boolean;
  readonly history: HistorySettings;
}

const MB = 1024 * 1024;

export const DEFAULT_HISTORY: HistorySettings = {
  steps: MAX_STEPS - 1,
  megabytes: HISTORY_BYTES / MB,
};

export const DEFAULT_SETTINGS: Settings = {
  limits: DEFAULT_LIMITS,
  rulers: false,
  history: DEFAULT_HISTORY,
};

/** Make the documents store use these history limits. */
function applyHistory(history: HistorySettings): void {
  historyLimits.steps = history.steps + 1;
  historyLimits.bytes = history.megabytes * MB;
}

const positive = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

/** Read saved settings. Unknown or broken values fall back to the defaults. */
export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<{
      limits: Partial<ImageLimits>;
      rulers: unknown;
      history: Partial<HistorySettings>;
    }>;
    return {
      limits: {
        maxFileBytes: positive(raw.limits?.maxFileBytes, DEFAULT_LIMITS.maxFileBytes),
        maxPixels: positive(raw.limits?.maxPixels, DEFAULT_LIMITS.maxPixels),
        maxSide: positive(raw.limits?.maxSide, DEFAULT_LIMITS.maxSide),
      },
      rulers: raw.rulers === true,
      history: {
        steps: Math.round(positive(raw.history?.steps, DEFAULT_HISTORY.steps)),
        megabytes: positive(raw.history?.megabytes, DEFAULT_HISTORY.megabytes),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage is blocked. The settings still apply for this visit.
  }
}

interface SettingsState extends Settings {
  setLimits: (limits: ImageLimits) => void;
  setHistory: (history: HistorySettings) => void;
  toggleRulers: () => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()((set, get) => {
  const persist = (change: Partial<Settings>) => {
    set(change);
    const { limits, rulers, history } = get();
    applyHistory(history);
    save({ limits, rulers, history });
  };
  const initial = typeof window === "undefined" ? DEFAULT_SETTINGS : loadSettings();
  applyHistory(initial.history);
  return {
    ...initial,
    setLimits: (limits) => persist({ limits }),
    setHistory: (history) => persist({ history }),
    toggleRulers: () => persist({ rulers: !get().rulers }),
    reset: () => persist(DEFAULT_SETTINGS),
  };
});
