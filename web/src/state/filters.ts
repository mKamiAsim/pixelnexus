/**
 * The selected filter, its parameter values, the live preview and the running job.
 *
 * Values are kept per filter for the session, so going back to a filter restores its settings.
 * Favorites and saved presets are a per-browser convenience and live in localStorage.
 */
import { create } from "zustand";

import type { FilterScope } from "@/core/composite/scope";
import type { Rect } from "@/core/filters/run";
import type { ParamValue } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";

const STORAGE_KEY = "pixelnexus.filters.v1";

export interface Preset {
  readonly name: string;
  readonly values: Readonly<Record<string, ParamValue>>;
}

export interface RunInfo {
  readonly kind: "apply" | "preview";
  readonly totalMs: number;
  readonly computeMs: number;
  readonly tiles: number;
  readonly workers: number;
  /** Milliseconds since 1970. */
  readonly at: number;
}

export interface PreviewState {
  readonly status: "off" | "waiting" | "running" | "ready" | "error";
  readonly documentId: string | null;
  /** The image the preview was computed from. A preview of an older image is not shown. */
  readonly source: RgbaImage | null;
  /** The filter result for `region`, at `scale` times the image resolution. */
  readonly result: RgbaImage | null;
  /** The part of the image the result covers, in image pixels. */
  readonly region: Rect | null;
  readonly scale: number;
  readonly approximate: boolean;
  /** Why the preview is approximate, or why it failed. */
  readonly note: string | null;
  readonly warnings: readonly string[];
}

export const NO_PREVIEW: PreviewState = {
  status: "off",
  documentId: null,
  source: null,
  result: null,
  region: null,
  scale: 1,
  approximate: false,
  note: null,
  warnings: [],
};

export interface ApplyState {
  readonly filterId: string;
  readonly progress: number;
  readonly controller: AbortController;
}

interface Saved {
  favorites: string[];
  presets: Record<string, Preset[]>;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Saved>;
    return {
      favorites: Array.isArray(raw.favorites)
        ? raw.favorites.filter((f) => typeof f === "string")
        : [],
      presets: raw.presets && typeof raw.presets === "object" ? raw.presets : {},
    };
  } catch {
    return { favorites: [], presets: {} };
  }
}

function save(saved: Saved): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage is blocked. Favorites and presets still work for this visit.
  }
}

interface FiltersState {
  selectedId: string | null;
  /** Values the user set, per filter. Missing keys use the catalog defaults. */
  values: Readonly<Record<string, Readonly<Record<string, ParamValue>>>>;
  previewOn: boolean;
  preview: PreviewState;
  /** Where filters work when the image has a selection. Without one they work on the whole image. */
  scope: FilterScope;
  applying: ApplyState | null;
  lastRun: Readonly<Record<string, RunInfo>>;
  favorites: readonly string[];
  presets: Readonly<Record<string, readonly Preset[]>>;
  select: (id: string | null) => void;
  setValue: (filterId: string, key: string, value: ParamValue) => void;
  setValues: (filterId: string, values: Readonly<Record<string, ParamValue>>) => void;
  resetValues: (filterId: string) => void;
  setPreviewOn: (on: boolean) => void;
  setScope: (scope: FilterScope) => void;
  setPreview: (preview: PreviewState) => void;
  setApplying: (applying: ApplyState | null) => void;
  setProgress: (progress: number) => void;
  setLastRun: (filterId: string, info: RunInfo) => void;
  toggleFavorite: (filterId: string) => void;
  savePreset: (filterId: string, preset: Preset) => void;
  deletePreset: (filterId: string, name: string) => void;
  /** Add presets from a file. A preset with the same name as a saved one replaces it. */
  importPresets: (presets: Readonly<Record<string, readonly Preset[]>>) => number;
}

const initial = typeof window === "undefined" ? { favorites: [], presets: {} } : load();

export const useFilters = create<FiltersState>()((set, get) => {
  const persist = () => {
    const { favorites, presets } = get();
    save({ favorites: [...favorites], presets: { ...presets } as Record<string, Preset[]> });
  };
  return {
    selectedId: null,
    values: {},
    previewOn: true,
    preview: NO_PREVIEW,
    scope: "selection",
    applying: null,
    lastRun: {},
    favorites: initial.favorites,
    presets: initial.presets,
    select: (selectedId) => set({ selectedId }),
    setValue: (filterId, key, value) =>
      set((state) => ({
        values: { ...state.values, [filterId]: { ...state.values[filterId], [key]: value } },
      })),
    setValues: (filterId, values) =>
      set((state) => ({ values: { ...state.values, [filterId]: { ...values } } })),
    resetValues: (filterId) =>
      set((state) => {
        const { [filterId]: _reset, ...values } = state.values;
        return { values };
      }),
    setPreviewOn: (previewOn) => set({ previewOn }),
    setScope: (scope) => set({ scope }),
    setPreview: (preview) => set({ preview }),
    setApplying: (applying) => set({ applying }),
    setProgress: (progress) =>
      set((state) => (state.applying ? { applying: { ...state.applying, progress } } : {})),
    setLastRun: (filterId, info) =>
      set((state) => ({ lastRun: { ...state.lastRun, [filterId]: info } })),
    toggleFavorite: (filterId) => {
      set((state) => ({
        favorites: state.favorites.includes(filterId)
          ? state.favorites.filter((f) => f !== filterId)
          : [...state.favorites, filterId],
      }));
      persist();
    },
    savePreset: (filterId, preset) => {
      set((state) => ({
        presets: {
          ...state.presets,
          [filterId]: [
            ...(state.presets[filterId] ?? []).filter((p) => p.name !== preset.name),
            preset,
          ],
        },
      }));
      persist();
    },
    importPresets: (incoming) => {
      let count = 0;
      set((state) => {
        const presets = { ...state.presets };
        for (const [filterId, list] of Object.entries(incoming)) {
          const names = new Set(list.map((p) => p.name));
          presets[filterId] = [
            ...(presets[filterId] ?? []).filter((p) => !names.has(p.name)),
            ...list,
          ];
          count += list.length;
        }
        return { presets };
      });
      persist();
      return count;
    },
    deletePreset: (filterId, name) => {
      set((state) => ({
        presets: {
          ...state.presets,
          [filterId]: (state.presets[filterId] ?? []).filter((p) => p.name !== name),
        },
      }));
      persist();
    },
  };
});
