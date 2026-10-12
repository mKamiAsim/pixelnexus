/** Interface state that is not part of a document. */
import { create } from "zustand";

import type { Size } from "@/canvas/viewport";
import { DEFAULT_THEME, storedTheme, type ThemeId } from "@/styles/themes";

export type ToolId = "hand" | "zoom" | "probe";
export type CompareMode = "off" | "split" | "side-by-side" | "overlay" | "difference";
export type DialogId = "export" | "palette" | "shortcuts" | "preferences" | null;

export interface PixelPoint {
  readonly documentId: string;
  readonly x: number;
  readonly y: number;
}

interface UiState {
  tool: ToolId;
  compare: CompareMode;
  /** Split position from 0 (left edge) to 1 (right edge). */
  split: number;
  /** Opacity of the original in overlay mode, from 0 to 1. */
  overlayOpacity: number;
  /** True while the "show original" key is held. */
  showOriginal: boolean;
  pixelGrid: boolean;
  /** The Zoom tool zooms out on click when true. Alt reverses it. */
  zoomOut: boolean;
  /** The pixel under the pointer. */
  hover: PixelPoint | null;
  /** A pixel pinned with the Probe tool. The Info panel prefers it over the hover pixel. */
  probe: PixelPoint | null;
  theme: ThemeId;
  /** Size of the active viewport in CSS pixels. Fit and 100% need it. */
  viewportSize: Size | null;
  dialog: DialogId;
  /** Labels of running tasks, such as opening files. The status bar shows the latest one. */
  work: readonly string[];
  setTool: (tool: ToolId) => void;
  setCompare: (mode: CompareMode) => void;
  setSplit: (split: number) => void;
  setOverlayOpacity: (opacity: number) => void;
  setShowOriginal: (show: boolean) => void;
  togglePixelGrid: () => void;
  setZoomOut: (zoomOut: boolean) => void;
  setHover: (point: PixelPoint | null) => void;
  setProbe: (point: PixelPoint | null) => void;
  setTheme: (theme: ThemeId) => void;
  setViewportSize: (size: Size | null) => void;
  setDialog: (dialog: DialogId) => void;
  beginWork: (label: string) => void;
  endWork: () => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const useUi = create<UiState>()((set) => ({
  tool: "hand",
  compare: "off",
  split: 0.5,
  overlayOpacity: 0.5,
  showOriginal: false,
  pixelGrid: true,
  zoomOut: false,
  hover: null,
  probe: null,
  theme: typeof window === "undefined" ? DEFAULT_THEME : storedTheme(),
  setTool: (tool) => set({ tool }),
  setCompare: (compare) => set({ compare }),
  setSplit: (split) => set({ split: clamp01(split) }),
  setOverlayOpacity: (overlayOpacity) => set({ overlayOpacity: clamp01(overlayOpacity) }),
  setShowOriginal: (showOriginal) => set({ showOriginal }),
  togglePixelGrid: () => set((state) => ({ pixelGrid: !state.pixelGrid })),
  setZoomOut: (zoomOut) => set({ zoomOut }),
  setHover: (hover) => set({ hover }),
  setProbe: (probe) => set({ probe }),
  setTheme: (theme) => set({ theme }),
  viewportSize: null,
  dialog: null,
  setViewportSize: (viewportSize) => set({ viewportSize }),
  setDialog: (dialog) => set({ dialog }),
  work: [],
  beginWork: (label) => set((state) => ({ work: [...state.work, label] })),
  endWork: () => set((state) => ({ work: state.work.slice(1) })),
}));
