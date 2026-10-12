/**
 * Saliency maps for subject selection without AI. Each map has one value per pixel of a small
 * work image, from 0 to 1, where higher means "more likely to catch the eye".
 *
 * - Frequency-tuned saliency (Achanta, Hemami, Estrada and Süsstrunk, CVPR 2009):
 *   S(x) = || I_mu - I_whc(x) ||, the CIELAB distance between the mean color of the image and
 *   the image after a small blur. PixelNexus blurs with the 5 x 5 binomial kernel.
 * - Spectral residual (Hou and Zhang, CVPR 2007): with A the log amplitude and P the phase of
 *   the Fourier transform of a 64 x 64 gray copy, R = A - (3 x 3 mean of A), and
 *   S = |F^-1(exp(R + iP))|^2, then smoothed. PixelNexus smooths with a Gaussian of sigma 2.5
 *   pixels at the 64 x 64 size.
 * - Center prior and edge density are PixelNexus's own simple cues.
 *
 * Catalog entry: catalog/tools/subject-heuristic.yaml.
 */
import { luma709 } from "@/core/color/convert";
import { gaussianKernel1d } from "@/core/filters/linear/gaussian";
import type { RgbaImage } from "@/core/image/types";

import { imageCoords } from "./color";

/** Plain float images, for the maps. */
export interface Field {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

const field = (width: number, height: number): Field => ({
  width,
  height,
  data: new Float32Array(width * height),
});

/** Scale values to the range 0 to 1. A constant field becomes all 0. */
export function normalize(f: Field): Field {
  let min = Infinity;
  let max = -Infinity;
  for (const v of f.data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const out = field(f.width, f.height);
  const span = max - min;
  if (span > 0)
    for (let i = 0; i < f.data.length; i++) out.data[i] = ((f.data[i] ?? 0) - min) / span;
  return out;
}

/** Correlate rows, then columns, with a symmetric 1D kernel. Edge values repeat. */
export function blurSeparable(f: Field, kernel: ArrayLike<number>): Field {
  const r = (kernel.length - 1) / 2;
  const { width: w, height: h } = f;
  const tmp = new Float32Array(w * h);
  const out = field(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        s += (kernel[k + r] ?? 0) * (f.data[y * w + xx] ?? 0);
      }
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        s += (kernel[k + r] ?? 0) * (tmp[yy * w + x] ?? 0);
      }
      out.data[y * w + x] = s;
    }
  }
  return out;
}

const BINOMIAL_5 = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

/** Frequency-tuned saliency of an image, at the image size. */
export function frequencyTuned(image: RgbaImage): Field {
  const { width: w, height: h } = image;
  const lab = imageCoords(image, "lab");
  const mean = [0, 0, 0];
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) mean[c] = (mean[c] ?? 0) + (lab[i * 3 + c] ?? 0);
  }
  for (let c = 0; c < 3; c++) mean[c] = (mean[c] ?? 0) / (w * h);
  const channels = [0, 1, 2].map((c) => {
    const f = field(w, h);
    for (let i = 0; i < w * h; i++) f.data[i] = lab[i * 3 + c] ?? 0;
    return blurSeparable(f, BINOMIAL_5);
  });
  const out = field(w, h);
  for (let i = 0; i < w * h; i++) {
    out.data[i] = Math.hypot(
      (channels[0]?.data[i] ?? 0) - (mean[0] ?? 0),
      (channels[1]?.data[i] ?? 0) - (mean[1] ?? 0),
      (channels[2]?.data[i] ?? 0) - (mean[2] ?? 0),
    );
  }
  return normalize(out);
}

/**
 * In-place radix-2 FFT of one complex sequence, length a power of 2. `inverse` runs the inverse
 * transform without the 1/n factor.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n & (n - 1)) throw new RangeError("The length must be a power of 2.");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = start + k;
        const b = a + size / 2;
        const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
    }
  }
}

/** 2D FFT of a square power-of-2 grid, rows then columns, in place. */
function fft2(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  const rr = new Float64Array(n);
  const ri = new Float64Array(n);
  for (const byRows of [true, false]) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const i = byRows ? a * n + b : b * n + a;
        rr[b] = re[i] ?? 0;
        ri[b] = im[i] ?? 0;
      }
      fft(rr, ri, inverse);
      for (let b = 0; b < n; b++) {
        const i = byRows ? a * n + b : b * n + a;
        re[i] = rr[b] ?? 0;
        im[i] = ri[b] ?? 0;
      }
    }
  }
}

/** The 64 x 64 gray copy the spectral residual works on, by area averaging. */
const SR_SIZE = 64;

/** Spectral residual saliency, at SR_SIZE x SR_SIZE. Resize it to use it with other maps. */
export function spectralResidual(image: RgbaImage): Field {
  const n = SR_SIZE;
  const gray = areaResize(lumaField(image), n, n);
  const re = Float64Array.from(gray.data);
  const im = new Float64Array(n * n);
  fft2(re, im, n, false);
  const amplitude = new Float64Array(n * n);
  const phase = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) {
    amplitude[i] = Math.log(Math.hypot(re[i] ?? 0, im[i] ?? 0) + 1e-9);
    phase[i] = Math.atan2(im[i] ?? 0, re[i] ?? 0);
  }
  // The residual: log amplitude minus its 3 x 3 mean. The spectrum wraps around.
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          s += amplitude[((y + dy + n) % n) * n + ((x + dx + n) % n)] ?? 0;
        }
      }
      const r = (amplitude[y * n + x] ?? 0) - s / 9;
      const e = Math.exp(r);
      re[y * n + x] = e * Math.cos(phase[y * n + x] ?? 0);
      im[y * n + x] = e * Math.sin(phase[y * n + x] ?? 0);
    }
  }
  fft2(re, im, n, true);
  const out = field(n, n);
  for (let i = 0; i < n * n; i++) out.data[i] = (re[i] ?? 0) ** 2 + (im[i] ?? 0) ** 2;
  return normalize(blurSeparable(out, gaussianKernel1d(2.5)));
}

/** BT.709 luma of each pixel, from 0 to 255. */
export function lumaField(image: RgbaImage): Field {
  const out = field(image.width, image.height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = luma709(
      image.data[i * 4] ?? 0,
      image.data[i * 4 + 1] ?? 0,
      image.data[i * 4 + 2] ?? 0,
    );
  }
  return out;
}

/** Resize by averaging the source area under each target pixel (bilinear when growing). */
export function areaResize(f: Field, width: number, height: number): Field {
  if (width === f.width && height === f.height) return f;
  const out = field(width, height);
  const sx = f.width / width;
  const sy = f.height / height;
  if (sx < 1 || sy < 1) {
    // Growing: bilinear between pixel centers.
    for (let y = 0; y < height; y++) {
      const v = Math.min(f.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
      const y0 = Math.floor(v);
      const y1 = Math.min(f.height - 1, y0 + 1);
      for (let x = 0; x < width; x++) {
        const u = Math.min(f.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
        const x0 = Math.floor(u);
        const x1 = Math.min(f.width - 1, x0 + 1);
        const a =
          (f.data[y0 * f.width + x0] ?? 0) * (1 - (u - x0)) +
          (f.data[y0 * f.width + x1] ?? 0) * (u - x0);
        const b =
          (f.data[y1 * f.width + x0] ?? 0) * (1 - (u - x0)) +
          (f.data[y1 * f.width + x1] ?? 0) * (u - x0);
        out.data[y * width + x] = a * (1 - (v - y0)) + b * (v - y0);
      }
    }
    return out;
  }
  for (let y = 0; y < height; y++) {
    const ya = Math.floor(y * sy);
    const yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const xa = Math.floor(x * sx);
      const xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
      let s = 0;
      for (let yy = ya; yy < yb; yy++) {
        for (let xx = xa; xx < xb; xx++) s += f.data[yy * f.width + xx] ?? 0;
      }
      out.data[y * width + x] = s / ((yb - ya) * (xb - xa));
    }
  }
  return out;
}

/**
 * Center prior: exp(-(u^2 + v^2) / (2 * 0.5^2)), where u and v run from -1 at one edge of the
 * image to 1 at the other. Photographers tend to put the subject near the middle.
 */
export function centerPrior(width: number, height: number): Field {
  const out = field(width, height);
  for (let y = 0; y < height; y++) {
    const v = ((y + 0.5) / height) * 2 - 1;
    for (let x = 0; x < width; x++) {
      const u = ((x + 0.5) / width) * 2 - 1;
      out.data[y * width + x] = Math.exp(-(u * u + v * v) / (2 * 0.25));
    }
  }
  return out;
}

/** Edge density: the Sobel gradient of luma, averaged over a box 1/8 of the longer side wide. */
export function edgeDensity(image: RgbaImage): Field {
  const g = lumaField(image);
  const { width: w, height: h } = g;
  const grad = field(w, h);
  const at = (x: number, y: number) =>
    g.data[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1);
      const gy =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1);
      grad.data[y * w + x] = Math.hypot(gx, gy);
    }
  }
  const size = Math.max(3, Math.round(Math.max(w, h) / 8)) | 1;
  return normalize(blurSeparable(grad, new Array<number>(size).fill(1 / size)));
}
