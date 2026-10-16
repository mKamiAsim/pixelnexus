/**
 * Less data out (PLAN.md section 3.11). For a task that allows it, the router sends only the
 * bounding box of the selection plus a margin, and can offer to downscale first.
 */
import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";
import type { Box } from "./types";

export { maskBounds } from "@/core/mask/mask";

/** The box grown by `margin` pixels on every side, kept inside the image. */
export function withMargin(box: Box, margin: number, width: number, height: number): Box {
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  const right = Math.min(width, box.x + box.width + margin);
  const bottom = Math.min(height, box.y + box.height + margin);
  return { x, y, width: right - x, height: bottom - y };
}

export function cropImage(image: RgbaImage, box: Box): RgbaImage {
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * image.width + box.x) * 4;
    data.set(image.data.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return { width: box.width, height: box.height, data };
}

export function cropMask(mask: Mask, box: Box): Mask {
  const data = new Uint8Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    const from = (box.y + y) * mask.width + box.x;
    data.set(mask.data.subarray(from, from + box.width), y * box.width);
  }
  return { width: box.width, height: box.height, data };
}

/** The scale that brings the longer side down to `longest`, or 1 when it already fits. */
export function downscaleFactor(width: number, height: number, longest: number): number {
  const side = Math.max(width, height);
  return side > longest ? longest / side : 1;
}
