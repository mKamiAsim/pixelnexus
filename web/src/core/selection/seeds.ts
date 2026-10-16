/**
 * Seed maps for the classical Click Select tool. A click marks an object seed and an Alt-click a
 * background seed, each a disk of pixels. The engine's random walker reads the map with three
 * levels: 255 for object seeds, 0 for background seeds and 128 for the pixels it decides.
 *
 * Catalog entry: catalog/tools/click-select-classical.yaml.
 */
import { createMask, type Mask } from "@/core/mask/mask";

export interface Seed {
  /** Image coordinates. The seed sits on the pixel that holds this point. */
  readonly x: number;
  readonly y: number;
  /** True for the object, false for the background. */
  readonly object: boolean;
}

export const SEED_OBJECT = 255;
export const SEED_BACKGROUND = 0;
export const SEED_UNKNOWN = 128;

/**
 * The seed map. Until there is a background seed, the pixels on the image edge are background
 * seeds, so a first click already has something to compare with. Later seeds paint over earlier
 * ones, and seeds paint over the edge.
 */
export function seedMap(
  width: number,
  height: number,
  seeds: readonly Seed[],
  radius: number,
): Mask {
  const mask = createMask(width, height, SEED_UNKNOWN);
  if (!seeds.some((s) => !s.object)) {
    for (let x = 0; x < width; x++) {
      mask.data[x] = SEED_BACKGROUND;
      mask.data[(height - 1) * width + x] = SEED_BACKGROUND;
    }
    for (let y = 0; y < height; y++) {
      mask.data[y * width] = SEED_BACKGROUND;
      mask.data[y * width + width - 1] = SEED_BACKGROUND;
    }
  }
  const r = Math.max(0, Math.floor(radius));
  for (const seed of seeds) {
    const cx = Math.floor(seed.x);
    const cy = Math.floor(seed.y);
    const value = seed.object ? SEED_OBJECT : SEED_BACKGROUND;
    for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask.data[y * width + x] = value;
      }
    }
  }
  return mask;
}
