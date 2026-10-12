/**
 * Settings of the selection tools, and selection state that is not part of a document's history.
 * The selection itself lives in the documents store, so undo and redo cover it.
 */
import { create } from "zustand";

import type { MaskView } from "@/canvas/renderer";
import type { ParamValue } from "@/core/filters/types";
import type { CombineMode, Mask } from "@/core/mask/mask";

/** A selection being drawn, shown in place of the document's selection until it is committed. */
export interface Draft {
  readonly documentId: string;
  readonly mask: Mask;
  /** Bumped on every change, because a draft mask is changed in place while you paint. */
  readonly version: number;
  /** The part that changed last, so only it needs uploading again. */
  readonly dirty: { x: number; y: number; width: number; height: number } | null;
}

interface SelectionState {
  /** How a new selection combines with the current one. Shift, Alt or both override it. */
  mode: CombineMode;
  /** Values per tool id, as set in the options bar. Validated against the catalog when used. */
  values: Readonly<Record<string, Readonly<Record<string, ParamValue>>>>;
  maskView: MaskView;
  /** The selection that Deselect removed, per document, for Reselect. */
  previous: Readonly<Record<string, Mask>>;
  draft: Draft | null;
  setMode: (mode: CombineMode) => void;
  setValue: (tool: string, key: string, value: ParamValue) => void;
  resetValues: (tool: string) => void;
  setMaskView: (view: MaskView) => void;
  remember: (documentId: string, mask: Mask) => void;
  setDraft: (draft: Draft | null) => void;
}

export const useSelection = create<SelectionState>()((set) => ({
  mode: "new",
  values: {},
  maskView: "ants",
  previous: {},
  draft: null,
  setMode: (mode) => set({ mode }),
  setValue: (tool, key, value) =>
    set((state) => ({
      values: { ...state.values, [tool]: { ...state.values[tool], [key]: value } },
    })),
  resetValues: (tool) =>
    set((state) => {
      const { [tool]: _reset, ...values } = state.values;
      return { values };
    }),
  setMaskView: (maskView) => set({ maskView }),
  remember: (documentId, mask) =>
    set((state) => ({ previous: { ...state.previous, [documentId]: mask } })),
  setDraft: (draft) => set({ draft }),
}));
