/**
 * The compositor. Every filter result goes through it, whichever engine made it (decision D9).
 *
 * I_out = M * F + (1 - M) * I, with M = mask / 255 from 0 to 1.
 *
 * Pixels where the mask is 0 keep their exact bytes. Pixels where it is 255 take the filter
 * result exactly. Between, each channel, alpha included, is blended and rounded once.
 */
import type { Rect } from "@/core/filters/run";
import type { RgbaImage } from "@/core/image/types";

/** A selection mask: one byte per pixel, 0 means unselected and 255 means fully selected. */
export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Put a filter result for `region` into a copy of `original`, through an optional mask that
 * covers the whole image. Without a mask, the whole region takes the result.
 */
export function composite(
  original: RgbaImage,
  result: RgbaImage,
  region: Rect,
  mask: Mask | null = null,
): RgbaImage {
  if (result.width !== region.width || result.height !== region.height) {
    throw new RangeError("The result does not match the size of its region.");
  }
  if (mask && (mask.width !== original.width || mask.height !== original.height)) {
    throw new RangeError("The mask does not match the size of the image.");
  }
  const data = original.data.slice();
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const ix = region.x + x;
      const iy = region.y + y;
      const m = mask ? (mask.data[iy * original.width + ix] ?? 0) : 255;
      if (m === 0) continue;
      const to = (iy * original.width + ix) * 4;
      const from = (y * region.width + x) * 4;
      if (m === 255) {
        data[to] = result.data[from] ?? 0;
        data[to + 1] = result.data[from + 1] ?? 0;
        data[to + 2] = result.data[from + 2] ?? 0;
        data[to + 3] = result.data[from + 3] ?? 0;
        continue;
      }
      const t = m / 255;
      for (let c = 0; c < 4; c++) {
        const i = original.data[to + c] ?? 0;
        const f = result.data[from + c] ?? 0;
        data[to + c] = Math.round(i + t * (f - i));
      }
    }
  }
  return { width: original.width, height: original.height, data };
}
