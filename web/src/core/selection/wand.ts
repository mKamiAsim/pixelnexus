/**
 * Magic Wand. Catalog entry: catalog/tools/magic-wand.yaml.
 *
 * A pixel p is selected when the distance between its color and the seed color is at most the
 * tolerance T: d(c_p, c_seed) <= T. The seed color is the mean of a small square around the
 * clicked pixel. In contiguous mode, a flood fill from the clicked pixel keeps only matching
 * pixels that connect to it through matching pixels that share an edge (4-connectivity).
 * Otherwise every matching pixel in the image is selected.
 */
import type { RgbaImage } from "@/core/image/types";
import { createMask, type Mask } from "@/core/mask/mask";

import { distance, imageCoords, sampleColor, toCoords, type ColorSpace } from "./color";

export interface WandOptions {
  /** 0 to 255, on the scale of the color space. */
  readonly tolerance: number;
  readonly contiguous: boolean;
  /** Side of the sampled square: 1, 3 or 5 pixels. */
  readonly sampleSize: number;
  readonly antiAlias: boolean;
  readonly colorSpace: ColorSpace;
}

/**
 * Soften a hard mask's edge: each pixel gets the mean of its 3x3 neighborhood inside the image.
 * Pixels whose neighborhood is all selected or all unselected keep their value.
 */
export function antiAliasEdges(mask: Mask): Mask {
  const { width, height, data } = mask;
  const out = createMask(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1); j++) {
        for (let i = Math.max(0, x - 1); i <= Math.min(width - 1, x + 1); i++) {
          sum += data[j * width + i] ?? 0;
          n++;
        }
      }
      out.data[y * width + x] = Math.round(sum / n);
    }
  }
  return out;
}

/** Select by color from the pixel at (x, y). A click outside the image selects nothing. */
export function magicWand(image: RgbaImage, x: number, y: number, options: WandOptions): Mask {
  const { width, height } = image;
  const mask = createMask(width, height);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;
  const coords = imageCoords(image, options.colorSpace);
  const seed = toCoords(...sampleColor(image, x, y, options.sampleSize), options.colorSpace);
  const matches = (i: number) =>
    distance([coords[i * 3] ?? 0, coords[i * 3 + 1] ?? 0, coords[i * 3 + 2] ?? 0], seed) <=
    options.tolerance;

  if (!options.contiguous) {
    for (let i = 0; i < width * height; i++) if (matches(i)) mask.data[i] = 255;
  } else {
    const start = y * width + x;
    if (matches(start)) {
      // Visited pixels are marked in the mask: 255 for matching, 1 for checked but not matching.
      const stack = new Int32Array(width * height);
      let top = 0;
      stack[top++] = start;
      mask.data[start] = 255;
      while (top > 0) {
        const i = stack[--top] ?? 0;
        const px = i % width;
        const neighbors = [
          px > 0 ? i - 1 : -1,
          px < width - 1 ? i + 1 : -1,
          i >= width ? i - width : -1,
          i < width * (height - 1) ? i + width : -1,
        ];
        for (const n of neighbors) {
          if (n < 0 || mask.data[n] !== 0) continue;
          if (matches(n)) {
            mask.data[n] = 255;
            stack[top++] = n;
          } else {
            mask.data[n] = 1;
          }
        }
      }
      for (let i = 0; i < mask.data.length; i++) if (mask.data[i] === 1) mask.data[i] = 0;
    }
  }
  return options.antiAlias ? antiAliasEdges(mask) : mask;
}
