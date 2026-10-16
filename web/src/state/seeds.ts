/**
 * The seeds of the Click Select tool. They belong to one image of one document, and start over
 * when the image or the document changes.
 */
import { create } from "zustand";

import type { RgbaImage } from "@/core/image/types";
import type { Seed } from "@/core/selection/seeds";

interface SeedState {
  readonly documentId: string | null;
  readonly image: RgbaImage | null;
  readonly seeds: readonly Seed[];
  /** Add a seed and return all seeds of this image. */
  add: (documentId: string, image: RgbaImage, seed: Seed) => readonly Seed[];
  clear: () => void;
}

export const useSeeds = create<SeedState>()((set, get) => ({
  documentId: null,
  image: null,
  seeds: [],
  add: (documentId, image, seed) => {
    const state = get();
    const same = state.documentId === documentId && state.image === image;
    const seeds = [...(same ? state.seeds : []), seed];
    set({ documentId, image, seeds });
    return seeds;
  },
  clear: () => set({ documentId: null, image: null, seeds: [] }),
}));
