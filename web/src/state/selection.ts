/**
 * Settings of the selection tools, and selection state that is not part of a document's history.
 * The selection itself lives in the documents store, so undo and redo cover it.
 */
import { create } from "zustand";

import type { MaskView } from "@/canvas/renderer";
import type { ParamValue } from "@/core/filters/types";
import type { CombineMode, Mask } from "@/core/mask/mask";

/** Refine operations in Select > Modify. */
export type RefineKind = "grow" | "shrink" | "feather" | "smooth" | "border";

interface SelectionState {
  /** How a new selection combines with the current one. Shift, Alt or both override it. */
  mode: CombineMode;
  /** Values per tool id, as set in the options bar. Validated against the catalog when used. */
  values: Readonly<Record<string, Readonly<Record<string, ParamValue>>>>;
  maskView: MaskView;
  /** The selection that Deselect removed, per document, for Reselect. */
  previous: Readonly<Record<string, Mask>>;
  /** The operation the Modify dialog shows. */
  refineKind: RefineKind;
  /** The last amount used for each refine operation, in pixels. */
  refineAmounts: Readonly<Partial<Record<RefineKind, number>>>;
  /** Shrink also pulls away from the image edge, as if the outside were unselected. */
  shrinkEdges: boolean;
  setMode: (mode: CombineMode) => void;
  setValue: (tool: string, key: string, value: ParamValue) => void;
  resetValues: (tool: string) => void;
  setMaskView: (view: MaskView) => void;
  remember: (documentId: string, mask: Mask) => void;
  setRefineKind: (kind: RefineKind) => void;
  setRefineAmount: (kind: RefineKind, amount: number) => void;
  setShrinkEdges: (edges: boolean) => void;
}

export const useSelection = create<SelectionState>()((set) => ({
  mode: "new",
  values: {},
  maskView: "ants",
  previous: {},
  refineKind: "grow",
  refineAmounts: {},
  shrinkEdges: false,
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
  setRefineKind: (refineKind) => set({ refineKind }),
  setRefineAmount: (kind, amount) =>
    set((state) => ({ refineAmounts: { ...state.refineAmounts, [kind]: amount } })),
  setShrinkEdges: (shrinkEdges) => set({ shrinkEdges }),
}));
