/**
 * Lossless geometric operations: quarter turns, mirrors and crops. Catalog entries:
 * utility/rotate-flip and utility/crop. They move whole pixels, so no value changes. Each pixel
 * is copied as one 32-bit word.
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

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The part of a crop rectangle that lies inside a width x height image, or null if none does. */
export function clampCrop(rect: CropRect, width: number, height: number): CropRect | null {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const right = Math.min(width, Math.round(rect.x + rect.width));
  const bottom = Math.min(height, Math.round(rect.y + rect.height));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** Keep the rectangle of the image. The rectangle must lie inside the image. */
export function crop(image: RgbaImage, rect: CropRect): RgbaImage {
  const out = createImage(rect.width, rect.height);
  const src = words(image);
  const dst = words(out);
  for (let y = 0; y < rect.height; y++) {
    const from = (rect.y + y) * image.width + rect.x;
    dst.set(src.subarray(from, from + rect.width), y * rect.width);
  }
  return out;
}
