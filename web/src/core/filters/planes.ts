/**
 * Float planes and the conversions every filter shares: border handling, splitting an RGBA
 * image into channels, BT.709 Y'CbCr for the brightness and color scopes, and linear light.
 *
 * Filters compute in 32-bit floats on values from 0 to 255 (decision D7). Rounding to 8 bits
 * happens once, at the end, in run.ts.
 */
import { linearToSrgb, srgbToLinear } from "@/core/color/convert";
import type { RgbaImage } from "@/core/image/types";

/** One channel of an image, row by row from the top left. */
export interface Plane {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

export type BorderMode = "reflect101" | "reflect" | "replicate" | "constant" | "wrap";

export const BORDER_MODES: readonly BorderMode[] = [
  "reflect101",
  "reflect",
  "replicate",
  "constant",
  "wrap",
];

export function isBorderMode(value: unknown): value is BorderMode {
  return BORDER_MODES.includes(value as BorderMode);
}

export function createPlane(width: number, height: number, fill = 0): Plane {
  const data = new Float32Array(width * height);
  if (fill !== 0) data.fill(fill);
  return { width, height, data };
}

/**
 * Map a coordinate that may lie outside 0..n-1 back inside, following the border mode.
 * Returns -1 for the constant mode, which means "use zero".
 *
 * For n = 5 and the coordinates -2, -1, 5, 6 the modes give:
 * - reflect101 (OpenCV default, SciPy "mirror"): 2, 1, 3, 2  (the edge pixel is not repeated)
 * - reflect (SciPy "reflect"):                   1, 0, 4, 3  (the edge pixel is repeated)
 * - replicate (SciPy "nearest"):                 0, 0, 4, 4
 * - wrap (SciPy "grid-wrap"):                    3, 4, 0, 1
 */
export function borderIndex(i: number, n: number, mode: BorderMode): number {
  if (i >= 0 && i < n) return i;
  switch (mode) {
    case "constant":
      return -1;
    case "replicate":
      return i < 0 ? 0 : n - 1;
    case "wrap":
      return ((i % n) + n) % n;
    case "reflect": {
      const period = 2 * n;
      const k = ((i % period) + period) % period;
      return k < n ? k : period - 1 - k;
    }
    case "reflect101": {
      if (n === 1) return 0;
      const period = 2 * n - 2;
      const k = ((i % period) + period) % period;
      return k < n ? k : period - k;
    }
  }
}

/** A lookup table of mapped indices for -pad .. n - 1 + pad, offset by pad. */
export function borderTable(n: number, pad: number, mode: BorderMode): Int32Array {
  const table = new Int32Array(n + 2 * pad);
  for (let i = 0; i < table.length; i++) table[i] = borderIndex(i - pad, n, mode);
  return table;
}

/** Split an RGBA image into four float planes. */
export function toPlanes(image: RgbaImage): [Plane, Plane, Plane, Plane] {
  const { width, height, data } = image;
  const planes = [0, 1, 2, 3].map(() => createPlane(width, height)) as [Plane, Plane, Plane, Plane];
  const [r, g, b, a] = planes.map((p) => p.data) as [
    Float32Array,
    Float32Array,
    Float32Array,
    Float32Array,
  ];
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    r[i] = data[o] ?? 0;
    g[i] = data[o + 1] ?? 0;
    b[i] = data[o + 2] ?? 0;
    a[i] = data[o + 3] ?? 0;
  }
  return planes;
}

/** BT.709 luma weights on encoded values. Same as luma709 in core/color/convert.ts. */
const KR = 0.2126;
const KG = 0.7152;
const KB = 0.0722;
/** Cb = (B - Y) / CB_SCALE, Cr = (R - Y) / CR_SCALE. Full range, no offset. */
const CB_SCALE = 2 * (1 - KB);
const CR_SCALE = 2 * (1 - KR);

/** BT.709 Y'CbCr on encoded values. Y' runs from 0 to 255, Cb and Cr from -127.5 to 127.5. */
export function rgbToYcc(r: Plane, g: Plane, b: Plane): [Plane, Plane, Plane] {
  const n = r.data.length;
  const y = createPlane(r.width, r.height);
  const cb = createPlane(r.width, r.height);
  const cr = createPlane(r.width, r.height);
  for (let i = 0; i < n; i++) {
    const rv = r.data[i] ?? 0;
    const bv = b.data[i] ?? 0;
    const yv = KR * rv + KG * (g.data[i] ?? 0) + KB * bv;
    y.data[i] = yv;
    cb.data[i] = (bv - yv) / CB_SCALE;
    cr.data[i] = (rv - yv) / CR_SCALE;
  }
  return [y, cb, cr];
}

/** The exact inverse of rgbToYcc. */
export function yccToRgb(y: Plane, cb: Plane, cr: Plane): [Plane, Plane, Plane] {
  const n = y.data.length;
  const r = createPlane(y.width, y.height);
  const g = createPlane(y.width, y.height);
  const b = createPlane(y.width, y.height);
  for (let i = 0; i < n; i++) {
    const yv = y.data[i] ?? 0;
    const rv = yv + CR_SCALE * (cr.data[i] ?? 0);
    const bv = yv + CB_SCALE * (cb.data[i] ?? 0);
    r.data[i] = rv;
    b.data[i] = bv;
    g.data[i] = (yv - KR * rv - KB * bv) / KG;
  }
  return [r, g, b];
}

/** Convert sRGB encoded values (0 to 255) to linear light, scaled to 0 to 255. In place. */
export function toLinearLight(plane: Plane): void {
  const { data } = plane;
  for (let i = 0; i < data.length; i++) data[i] = srgbToLinear(data[i] ?? 0) * 255;
}

/** The inverse of toLinearLight. Values outside 0 to 255 are clamped first. In place. */
export function fromLinearLight(plane: Plane): void {
  const { data } = plane;
  for (let i = 0; i < data.length; i++) {
    const v = Math.min(255, Math.max(0, data[i] ?? 0));
    data[i] = linearToSrgb(v / 255);
  }
}
