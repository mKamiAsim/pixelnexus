/**
 * Feature results, such as blobs and keypoints, one set per document. They belong to the image
 * they were found on: when the image changes, they stay in the Features panel but leave the
 * canvas, since they no longer match the pixels.
 */
import { create } from "zustand";

import type { LabelMap } from "@/core/features/labels";
import type { FeatureTable } from "@/core/features/table";
import type { RgbaImage } from "@/core/image/types";

import { useDocuments } from "./documents";

export interface FeatureLayer {
  readonly filterId: string;
  /** A label for the panel and file names, such as "LoG blob detection (threshold 0.2)". */
  readonly label: string;
  /** The image the features were found on. */
  readonly source: RgbaImage;
  readonly table: FeatureTable;
  /** For segmentation results: the regions of the whole image. */
  readonly labels?: LabelMap;
}

interface FeaturesState {
  readonly layers: Readonly<Record<string, FeatureLayer>>;
  /** Whether the canvas draws the features of the active image. */
  readonly visible: boolean;
  set: (documentId: string, layer: FeatureLayer) => void;
  clear: (documentId: string) => void;
  setVisible: (visible: boolean) => void;
}

export const useFeatures = create<FeaturesState>()((set) => ({
  layers: {},
  visible: true,
  set: (documentId, layer) =>
    set((s) => ({ layers: { ...s.layers, [documentId]: layer }, visible: true })),
  clear: (documentId) =>
    set((s) => ({
      layers: Object.fromEntries(Object.entries(s.layers).filter(([id]) => id !== documentId)),
    })),
  setVisible: (visible) => set({ visible }),
}));

// Forget the features of closed images, so their pixels can be freed.
useDocuments.subscribe((state) => {
  const open = new Set(state.documents.map((d) => d.id));
  const { layers } = useFeatures.getState();
  if (Object.keys(layers).every((id) => open.has(id))) return;
  useFeatures.setState({
    layers: Object.fromEntries(Object.entries(layers).filter(([id]) => open.has(id))),
  });
});
