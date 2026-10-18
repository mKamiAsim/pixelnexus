/**
 * Selection masks. A mask has one byte per pixel and always covers the whole image:
 * 0 means not selected, 255 means fully selected, and values between mean partly selected
 * (decision D8). The compositor scales them to 0 to 1 only when it blends.
 *
 * Soft masks combine with the standard fuzzy set operators: union is the larger value,
 * intersection the smaller value, and the complement is 255 - m. On hard masks, which hold
 * only 0 and 255, these are the usual set operations.
 */
import { luma709 } from "@/core/color/convert";
import type { Rect } from "@/core/filters/run";
import type { RgbaImage } from "@/core/image/types";

export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** How a new selection combines with the current one. */
export type CombineMode = "new" | "add" | "subtract" | "intersect";

export const COMBINE_MODES: readonly CombineMode[] = ["new", "add", "subtract", "intersect"];

/** The level from which a soft pixel counts as selected, for operations that need a yes or no. */
export const HALF = 128;

export function createMask(width: number, height: number, fill = 0): Mask {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Mask size must be positive integers, got ${width}x${height}.`);
  }
  const data = new Uint8Array(width * height);
  if (fill !== 0) data.fill(fill);
  return { width, height, data };
}

export const selectAll = (width: number, height: number): Mask => createMask(width, height, 255);

function assertSameSize(a: Mask, b: Mask): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError("The two masks have different sizes.");
  }
}

export function invertMask(mask: Mask): Mask {
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = 255 - (mask.data[i] ?? 0);
  return out;
}

/**
 * Combine the current selection with a new one. Without a current selection, "add" and
 * "new" give the new selection, and "subtract" and "intersect" give an empty one.
 */
export function combineMasks(current: Mask | null, next: Mask, mode: CombineMode): Mask {
  if (mode === "new") return next;
  if (!current) {
    return mode === "add" ? next : createMask(next.width, next.height);
  }
  assertSameSize(current, next);
  const out = createMask(next.width, next.height);
  const a = current.data;
  const b = next.data;
  for (let i = 0; i < out.data.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    out.data[i] =
      mode === "add"
        ? Math.max(x, y)
        : mode === "intersect"
          ? Math.min(x, y)
          : Math.min(x, 255 - y);
  }
  return out;
}

/** The smallest rectangle that holds every pixel above 0, or null for an empty mask. */
export function maskBounds(mask: Mask): Rect | null {
  const { width, height, data } = mask;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if ((data[row + x] ?? 0) > 0) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first < 0) continue;
    if (y < y0) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export interface MaskStats {
  /** Pixels above 0. */
  readonly touched: number;
  /** The selected area in pixels: the sum of all values divided by 255. */
  readonly area: number;
  /** True when some pixel is partly selected. */
  readonly soft: boolean;
  readonly bounds: Rect | null;
}

export function maskStats(mask: Mask): MaskStats {
  let touched = 0;
  let sum = 0;
  let soft = false;
  for (const v of mask.data) {
    if (v === 0) continue;
    touched++;
    sum += v;
    if (v !== 255) soft = true;
  }
  return { touched, area: sum / 255, soft, bounds: touched ? maskBounds(mask) : null };
}

export function isMaskEmpty(mask: Mask): boolean {
  return mask.data.every((v) => v === 0);
}

/** A hard copy: 255 where the value is at least `level`, else 0. */
export function thresholdMask(mask: Mask, level = HALF): Mask {
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = (mask.data[i] ?? 0) >= level ? 255 : 0;
  return out;
}

/** The selection from the alpha channel: opaque pixels are selected. */
export function maskFromAlpha(image: RgbaImage): Mask {
  const out = createMask(image.width, image.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = image.data[i * 4 + 3] ?? 0;
  return out;
}

/** The selection from brightness: BT.709 luma of the stored values, rounded. Bright is selected. */
export function maskFromLuminance(image: RgbaImage): Mask {
  const out = createMask(image.width, image.height);
  const d = image.data;
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.round(luma709(d[i * 4] ?? 0, d[i * 4 + 1] ?? 0, d[i * 4 + 2] ?? 0));
  }
  return out;
}

/** The mask as a gray image, for saving as a file or showing as a picture. */
export function maskToImage(mask: Mask): RgbaImage {
  const data = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let i = 0; i < mask.data.length; i++) {
    const v = mask.data[i] ?? 0;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width: mask.width, height: mask.height, data };
}

/** A part of the mask, for region processing. */
export function cropMask(mask: Mask, rect: Rect): Mask {
  const out = createMask(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    const from = (rect.y + y) * mask.width + rect.x;
    out.data.set(mask.data.subarray(from, from + rect.width), y * rect.width);
  }
  return out;
}

export function masksEqual(a: Mask | null, b: Mask | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/**
 * Scale a mask to a new size by bilinear interpolation between pixel centers, with the edge
 * pixels repeated. A hard mask scaled up gets a soft edge about one source pixel wide, which
 * works like anti-aliasing.
 */
export function resizeMask(mask: Mask, width: number, height: number): Mask {
  if (width === mask.width && height === mask.height) return mask;
  const out = createMask(width, height);
  const sx = mask.width / width;
  const sy = mask.height / height;
  const xs = new Int32Array(width);
  const fx = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const u = Math.min(mask.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
    xs[x] = Math.min(mask.width - 2, Math.floor(u));
    fx[x] = u - (xs[x] ?? 0);
  }
  for (let y = 0; y < height; y++) {
    const v = Math.min(mask.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.max(0, Math.min(mask.height - 2, Math.floor(v)));
    const y1 = Math.min(mask.height - 1, y0 + 1);
    const t = v - y0;
    const top = y0 * mask.width;
    const bottom = y1 * mask.width;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, xs[x] ?? 0);
      const x1 = Math.min(mask.width - 1, x0 + 1);
      const s = fx[x] ?? 0;
      const a = (mask.data[top + x0] ?? 0) * (1 - s) + (mask.data[top + x1] ?? 0) * s;
      const b = (mask.data[bottom + x0] ?? 0) * (1 - s) + (mask.data[bottom + x1] ?? 0) * s;
      out.data[y * width + x] = Math.round(a * (1 - t) + b * t);
    }
  }
  return out;
}
