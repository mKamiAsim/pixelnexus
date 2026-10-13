/**
 * Resampling: resize with a choice of kernel, and rotation by any angle.
 * Catalog entries: catalog/filters/utility/resize.yaml and rotate-free.yaml.
 *
 * Coordinates: pixel i covers [i, i + 1), and its center is i + 1/2. Resize maps the center of
 * output pixel x to the source position u = (x + 1/2) s - 1/2 in pixel-center units, where s is
 * the source size divided by the output size. Each output value is a weighted sum of source
 * pixels near u, with weights k((i - u) / f) normalized to add up to 1. Here f = max(s, 1):
 * when shrinking, the kernel widens by the shrink factor so it also averages, which prevents
 * aliasing. Near the image edge, pixels outside the image are left out and the rest renormalized.
 *
 * Kernels, as in Pillow:
 *   bilinear  k(x) = 1 - |x| for |x| < 1
 *   bicubic   Keys with a = -1/2: (a + 2)|x|^3 - (a + 3)|x|^2 + 1 for |x| <= 1,
 *             a|x|^3 - 5a|x|^2 + 8a|x| - 4a for 1 < |x| < 2
 *   lanczos   sinc(x) sinc(x / 3) for |x| < 3
 * Nearest takes the source pixel floor((x + 1/2) s).
 *
 * Colors are premultiplied by alpha before they are mixed, and divided again after, so
 * transparent pixels add no color. The work runs in float, and each value is rounded once.
 */
import type { RgbaImage } from "./types";

export type ResizeMethod = "nearest" | "bilinear" | "bicubic" | "lanczos";
export type Interpolation = "nearest" | "bilinear" | "bicubic";

const KEYS_A = -0.5;

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

/** The kernel k(x) and its support, the |x| beyond which it is 0. */
export function resampleKernel(method: Exclude<ResizeMethod, "nearest">): {
  support: number;
  weight: (x: number) => number;
} {
  switch (method) {
    case "bilinear":
      return { support: 1, weight: (x) => Math.max(0, 1 - Math.abs(x)) };
    case "bicubic":
      return {
        support: 2,
        weight: (x) => {
          const t = Math.abs(x);
          const a = KEYS_A;
          if (t <= 1) return ((a + 2) * t - (a + 3)) * t * t + 1;
          if (t < 2) return ((t - 5) * t + 8) * t * a - 4 * a;
          return 0;
        },
      };
    case "lanczos":
      return { support: 3, weight: (x) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0) };
  }
}

/** For each output index: the first source index and the normalized weights. */
interface Taps {
  readonly start: Int32Array;
  readonly count: Int32Array;
  readonly weights: Float64Array;
  readonly stride: number;
}

function taps(inSize: number, outSize: number, method: Exclude<ResizeMethod, "nearest">): Taps {
  const { support, weight } = resampleKernel(method);
  const scale = inSize / outSize;
  const f = Math.max(scale, 1);
  const reach = support * f;
  const stride = Math.ceil(reach) * 2 + 2;
  const start = new Int32Array(outSize);
  const count = new Int32Array(outSize);
  const weights = new Float64Array(outSize * stride);
  for (let x = 0; x < outSize; x++) {
    const u = (x + 0.5) * scale - 0.5;
    const lo = Math.max(0, Math.ceil(u - reach));
    const hi = Math.min(inSize - 1, Math.floor(u + reach));
    let sum = 0;
    for (let i = lo; i <= hi; i++) {
      const w = weight((i - u) / f);
      weights[x * stride + (i - lo)] = w;
      sum += w;
    }
    // A kernel that misses every pixel cannot happen for these supports, but keep it safe.
    if (sum === 0) {
      const nearest = Math.min(inSize - 1, Math.max(0, Math.round(u)));
      start[x] = nearest;
      count[x] = 1;
      weights[x * stride] = 1;
      continue;
    }
    for (let i = 0; i <= hi - lo; i++)
      weights[x * stride + i] = (weights[x * stride + i] ?? 0) / sum;
    start[x] = lo;
    count[x] = hi - lo + 1;
  }
  return { start, count, weights, stride };
}

/** Premultiplied float RGBA: color times alpha / 255, and alpha. */
function premultiply(image: RgbaImage): Float64Array {
  const out = new Float64Array(image.width * image.height * 4);
  for (let i = 0; i < image.width * image.height; i++) {
    const a = image.data[i * 4 + 3] ?? 0;
    const k = a / 255;
    out[i * 4] = (image.data[i * 4] ?? 0) * k;
    out[i * 4 + 1] = (image.data[i * 4 + 1] ?? 0) * k;
    out[i * 4 + 2] = (image.data[i * 4 + 2] ?? 0) * k;
    out[i * 4 + 3] = a;
  }
  return out;
}

const clampByte = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** Back to straight 8-bit RGBA. Where alpha rounds to 0, the color is 0. */
function unpremultiply(data: Float64Array, width: number, height: number): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = Math.min(255, Math.max(0, data[i * 4 + 3] ?? 0));
    const alpha = clampByte(a);
    out[i * 4 + 3] = alpha;
    if (a <= 0) continue;
    const k = 255 / a;
    out[i * 4] = clampByte((data[i * 4] ?? 0) * k);
    out[i * 4 + 1] = clampByte((data[i * 4 + 1] ?? 0) * k);
    out[i * 4 + 2] = clampByte((data[i * 4 + 2] ?? 0) * k);
  }
  return { width, height, data: out };
}

/** Resize an image to width x height with the chosen kernel. */
export function resizeImageTo(
  image: RgbaImage,
  width: number,
  height: number,
  method: ResizeMethod,
): RgbaImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`The size must be whole numbers of at least 1, got ${width} x ${height}.`);
  }
  if (method === "nearest") {
    const out = new Uint8ClampedArray(width * height * 4);
    const sx = image.width / width;
    const sy = image.height / height;
    const xs = Int32Array.from({ length: width }, (_, x) =>
      Math.min(image.width - 1, Math.floor((x + 0.5) * sx)),
    );
    for (let y = 0; y < height; y++) {
      const row = Math.min(image.height - 1, Math.floor((y + 0.5) * sy)) * image.width;
      for (let x = 0; x < width; x++) {
        const from = (row + (xs[x] ?? 0)) * 4;
        out.set(image.data.subarray(from, from + 4), (y * width + x) * 4);
      }
    }
    return { width, height, data: out };
  }
  const source = premultiply(image);
  // Rows first: image.height rows of `width` pixels.
  const h = taps(image.width, width, method);
  const mid = new Float64Array(width * image.height * 4);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < width; x++) {
      const s = h.start[x] ?? 0;
      const n = h.count[x] ?? 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < n; k++) {
        const w = h.weights[x * h.stride + k] ?? 0;
        const o = (y * image.width + s + k) * 4;
        r += w * (source[o] ?? 0);
        g += w * (source[o + 1] ?? 0);
        b += w * (source[o + 2] ?? 0);
        a += w * (source[o + 3] ?? 0);
      }
      const o = (y * width + x) * 4;
      mid[o] = r;
      mid[o + 1] = g;
      mid[o + 2] = b;
      mid[o + 3] = a;
    }
  }
  // Then columns.
  const v = taps(image.height, height, method);
  const out = new Float64Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const s = v.start[y] ?? 0;
    const n = v.count[y] ?? 0;
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < n; k++) {
        const w = v.weights[y * v.stride + k] ?? 0;
        const o = ((s + k) * width + x) * 4;
        r += w * (mid[o] ?? 0);
        g += w * (mid[o + 1] ?? 0);
        b += w * (mid[o + 2] ?? 0);
        a += w * (mid[o + 3] ?? 0);
      }
      const o = (y * width + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  return unpremultiply(out, width, height);
}

/** The output size of a rotation that keeps the whole image. */
export function rotatedSize(width: number, height: number, degrees: number): [number, number] {
  const t = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  // The small tolerance keeps 90 degree steps from growing by one pixel through rounding.
  return [
    Math.max(1, Math.ceil(width * c + height * s - 1e-9)),
    Math.max(1, Math.ceil(width * s + height * c - 1e-9)),
  ];
}

export interface RotateOptions {
  readonly interpolation: Interpolation;
  /** True grows the canvas to hold the whole rotated image. False keeps the size and crops. */
  readonly expand: boolean;
  /** Color for the new corners, as RGBA. Alpha 0 leaves them transparent. */
  readonly fill: readonly [number, number, number, number];
}

/**
 * Rotate counterclockwise by `degrees` around the image center. Each output pixel center is
 * turned back into the source and sampled there. Outside the source, the premultiplied values
 * are 0, so the new corners are transparent before the fill is laid under them.
 */
export function rotateImage(image: RgbaImage, degrees: number, options: RotateOptions): RgbaImage {
  const { width: w, height: h } = image;
  const [W, H] = options.expand ? rotatedSize(w, h, degrees) : [w, h];
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const source = premultiply(image);
  const at = (x: number, y: number, c: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : (source[(y * w + x) * 4 + c] ?? 0);
  const keys = resampleKernel("bicubic").weight;
  const out = new Float64Array(W * H * 4);
  const value = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Output position relative to the output center, turned back by the angle.
      const dx = x + 0.5 - W / 2;
      const dy = y + 0.5 - H / 2;
      const u = dx * cos - dy * sin + w / 2 - 0.5;
      const v = dx * sin + dy * cos + h / 2 - 0.5;
      value.fill(0);
      if (options.interpolation === "nearest") {
        const i = Math.floor(u + 0.5);
        const j = Math.floor(v + 0.5);
        for (let c = 0; c < 4; c++) value[c] = at(i, j, c);
      } else if (options.interpolation === "bilinear") {
        const i = Math.floor(u);
        const j = Math.floor(v);
        const fu = u - i;
        const fv = v - j;
        for (let c = 0; c < 4; c++) {
          value[c] =
            (1 - fv) * ((1 - fu) * at(i, j, c) + fu * at(i + 1, j, c)) +
            fv * ((1 - fu) * at(i, j + 1, c) + fu * at(i + 1, j + 1, c));
        }
      } else {
        const i = Math.floor(u);
        const j = Math.floor(v);
        for (let n = -1; n <= 2; n++) {
          const wy = keys(v - (j + n));
          if (wy === 0) continue;
          for (let m = -1; m <= 2; m++) {
            const wxy = keys(u - (i + m)) * wy;
            if (wxy === 0) continue;
            for (let c = 0; c < 4; c++) {
              value[c] = (value[c] ?? 0) + wxy * at(i + m, j + n, c);
            }
          }
        }
      }
      const o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = value[c] ?? 0;
    }
  }
  const [fr, fg, fb, fa] = options.fill;
  if (fa > 0) {
    // Lay the fill color under the result: premultiplied "over".
    const k = fa / 255;
    for (let i = 0; i < W * H; i++) {
      const a = Math.min(255, Math.max(0, out[i * 4 + 3] ?? 0)) / 255;
      out[i * 4] = (out[i * 4] ?? 0) + fr * k * (1 - a);
      out[i * 4 + 1] = (out[i * 4 + 1] ?? 0) + fg * k * (1 - a);
      out[i * 4 + 2] = (out[i * 4 + 2] ?? 0) + fb * k * (1 - a);
      out[i * 4 + 3] = (a + k * (1 - a)) * 255;
    }
  }
  return unpremultiply(out, W, H);
}
