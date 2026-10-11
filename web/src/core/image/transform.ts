/**
 * Lossless geometric operations: quarter turns and mirrors. Catalog entry: utility/rotate-flip.
 * They move whole pixels, so no value changes. Each pixel is copied as one 32-bit word.
 */
import { createImage, type RgbaImage } from "@/core/image/types";

export type QuarterTurn = "cw" | "ccw" | "half";
export type FlipAxis = "horizontal" | "vertical";

function words(image: RgbaImage): Uint32Array {
  return new Uint32Array(image.data.buffer, image.data.byteOffset, image.width * image.height);
}

/** Rotate by 90 degrees clockwise or counterclockwise, or by 180 degrees. */
export function rotate(image: RgbaImage, turn: QuarterTurn): RgbaImage {
  const { width: w, height: h } = image;
  const swap = turn !== "half";
  const out = createImage(swap ? h : w, swap ? w : h);
  const src = words(image);
  const dst = words(out);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const value = src[y * w + x] ?? 0;
      if (turn === "cw") dst[x * h + (h - 1 - y)] = value;
      else if (turn === "ccw") dst[(w - 1 - x) * h + y] = value;
      else dst[(h - 1 - y) * w + (w - 1 - x)] = value;
    }
  }
  return out;
}

/** Mirror left to right (horizontal) or top to bottom (vertical). */
export function flip(image: RgbaImage, axis: FlipAxis): RgbaImage {
  const { width: w, height: h } = image;
  const out = createImage(w, h);
  const src = words(image);
  const dst = words(out);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const target = axis === "horizontal" ? y * w + (w - 1 - x) : (h - 1 - y) * w + x;
      dst[target] = src[y * w + x] ?? 0;
    }
  }
  return out;
}
