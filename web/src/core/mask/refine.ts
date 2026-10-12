/**
 * Refine a selection: grow, shrink, border, smooth and feather.
 *
 * Grow, shrink, border and smooth work on the hard selection: a pixel counts as selected when
 * its value is at least 128. Their results are hard masks. Feather works on any mask and gives
 * a soft one. Distances are Euclidean, between pixel centers, from the exact distance transform.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { createPlane } from "@/core/filters/planes";
import { gaussianKernel1d } from "@/core/filters/linear/gaussian";

import { squaredDistance } from "./distance";
import { createMask, HALF, type Mask } from "./mask";

const selected = (mask: Mask) => (i: number) => (mask.data[i] ?? 0) >= HALF;

/**
 * Squared distance from each pixel to the nearest unselected pixel. When `edgeIsOutside` is
 * true, the area around the image counts as unselected, so the selection also shrinks away
 * from the image edges.
 */
function distanceToOutside(mask: Mask, edgeIsOutside: boolean): Float64Array {
  const { width, height } = mask;
  if (!edgeIsOutside) {
    return squaredDistance(width, height, (i) => (mask.data[i] ?? 0) < HALF);
  }
  const w = width + 2;
  const h = height + 2;
  const padded = squaredDistance(w, h, (i) => {
    const x = (i % w) - 1;
    const y = Math.floor(i / w) - 1;
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    return (mask.data[y * width + x] ?? 0) < HALF;
  });
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = padded[(y + 1) * w + x + 1] ?? 0;
  }
  return out;
}

/** Select every pixel within `radius` pixels of the selection. */
export function growMask(mask: Mask, radius: number): Mask {
  const r2 = radius * radius;
  const d2 = squaredDistance(mask.width, mask.height, selected(mask));
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = (d2[i] ?? Infinity) <= r2 ? 255 : 0;
  return out;
}

/** Keep the selected pixels that are more than `radius` pixels from any unselected pixel. */
export function shrinkMask(mask: Mask, radius: number, edgeIsOutside = false): Mask {
  const r2 = radius * radius;
  const d2 = distanceToOutside(mask, edgeIsOutside);
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = (d2[i] ?? 0) > r2 ? 255 : 0;
  return out;
}

/**
 * A band along the edge of the selection, `width` pixels wide in total. Half of it lies inside
 * the selection and half outside. For an odd width, the inside half is one pixel wider.
 */
export function borderMask(mask: Mask, width: number): Mask {
  const inside = Math.ceil(width / 2);
  const outside = Math.floor(width / 2);
  const toOutside = distanceToOutside(mask, false);
  const toInside = squaredDistance(mask.width, mask.height, selected(mask));
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) {
    const isSelected = (mask.data[i] ?? 0) >= HALF;
    const near = isSelected
      ? (toOutside[i] ?? Infinity) <= inside * inside
      : (toInside[i] ?? Infinity) <= outside * outside;
    out.data[i] = near ? 255 : 0;
  }
  return out;
}

/**
 * Majority vote in a square window of side 2 * radius + 1. A pixel becomes selected when more
 * than half of the window's pixels inside the image are selected, and unselected when fewer
 * than half are. On a tie it keeps its state. This removes small specks and rounds corners.
 */
export function smoothMask(mask: Mask, radius: number): Mask {
  const { width, height } = mask;
  // Summed-area table of selected pixels, one row and column larger than the image.
  const w = width + 1;
  const sums = new Int32Array(w * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += (mask.data[y * width + x] ?? 0) >= HALF ? 1 : 0;
      sums[(y + 1) * w + x + 1] = (sums[y * w + x + 1] ?? 0) + row;
    }
  }
  const out = createMask(width, height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const count =
        (sums[y1 * w + x1] ?? 0) -
        (sums[y0 * w + x1] ?? 0) -
        (sums[y1 * w + x0] ?? 0) +
        (sums[y0 * w + x0] ?? 0);
      const total = (x1 - x0) * (y1 - y0);
      const self = (mask.data[y * width + x] ?? 0) >= HALF;
      out.data[y * width + x] = 2 * count > total ? 255 : 2 * count < total ? 0 : self ? 255 : 0;
    }
  }
  return out;
}

/** The Gaussian standard deviation for a feather radius: half the radius. */
export const featherSigma = (radius: number) => radius / 2;

/**
 * Soften the edge of the selection with a Gaussian blur of standard deviation radius / 2.
 * About 95% of the change from selected to unselected then happens within `radius` pixels on
 * each side of the old edge. Outside the image, the edge pixels repeat, so a selection that
 * touches the image edge does not fade there.
 */
export function featherMask(mask: Mask, radius: number): Mask {
  if (radius <= 0) return mask;
  const { width, height } = mask;
  const plane = createPlane(width, height);
  for (let i = 0; i < plane.data.length; i++) plane.data[i] = mask.data[i] ?? 0;
  const kernel = gaussianKernel1d(featherSigma(radius), 3);
  const blurred = correlateSeparable(plane, kernel, kernel, "replicate");
  const out = createMask(width, height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.min(255, Math.max(0, Math.round(blurred.data[i] ?? 0)));
  }
  return out;
}
