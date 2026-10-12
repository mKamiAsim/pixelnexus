/**
 * Preferences that you can change in the studio. They are a per-browser convenience, so they
 * live in localStorage. Storage can be blocked, so every access is guarded and the defaults apply.
 */
import { create } from "zustand";

import { DEFAULT_LIMITS, type ImageLimits } from "@/core/image/limits";

const STORAGE_KEY = "pixelnexus.settings.v1";

export interface Settings {
  readonly limits: ImageLimits;
  readonly rulers: boolean;
}

export const DEFAULT_SETTINGS: Settings = { limits: DEFAULT_LIMITS, rulers: false };

const positive = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

/** Read saved settings. Unknown or broken values fall back to the defaults. */
export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<{
      limits: Partial<ImageLimits>;
      rulers: unknown;
    }>;
    return {
      limits: {
        maxFileBytes: positive(raw.limits?.maxFileBytes, DEFAULT_LIMITS.maxFileBytes),
        maxPixels: positive(raw.limits?.maxPixels, DEFAULT_LIMITS.maxPixels),
        maxSide: positive(raw.limits?.maxSide, DEFAULT_LIMITS.maxSide),
      },
      rulers: raw.rulers === true,
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
  toggleRulers: () => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()((set, get) => {
  const persist = (change: Partial<Settings>) => {
    set(change);
    const { limits, rulers } = get();
    save({ limits, rulers });
  };
  return {
    ...(typeof window === "undefined" ? DEFAULT_SETTINGS : loadSettings()),
    setLimits: (limits) => persist({ limits }),
    toggleRulers: () => persist({ rulers: !get().rulers }),
    reset: () => persist(DEFAULT_SETTINGS),
  };
});
