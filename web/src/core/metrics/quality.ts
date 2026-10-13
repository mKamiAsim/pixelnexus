/**
 * Image quality metrics against a reference. Catalog entry: catalog/filters/utility/metrics.yaml.
 *
 * All four compare the red, green and blue channels of two images of the same size. Alpha is
 * left out.
 *
 * - MSE: the mean of the squared differences.
 * - MAE: the mean of the absolute differences.
 * - PSNR: 10 log10(255^2 / MSE) in decibels. Infinite for identical images.
 * - SSIM (Wang, Bovik, Sheikh and Simoncelli, 2004): local means, variances and covariance from a
 *   Gaussian window with sigma 1.5, the constants K1 = 0.01 and K2 = 0.03 and L = 255, as in
 *   skimage.metrics.structural_similarity with gaussian_weights=True. Like skimage, it blurs with
 *   the reflect mode and truncate 3.5, leaves out a 5-pixel frame where the window does not fit,
 *   averages the map, and averages the three channels.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { gaussianKernel1d } from "@/core/filters/linear/gaussian";
import type { Plane } from "@/core/filters/planes";
import type { RgbaImage } from "@/core/image/types";

export interface QualityMetrics {
  readonly mse: number;
  readonly mae: number;
  /** In decibels. Infinity when the images are equal. */
  readonly psnr: number;
  /** From -1 to 1. NaN when the image is smaller than the 11x11 window. */
  readonly ssim: number;
}

const L = 255;
const K1 = 0.01;
const K2 = 0.03;
const SIGMA = 1.5;
const TRUNCATE = 3.5;
/** Half of the window that skimage leaves out at the image edge. */
export const SSIM_FRAME = 5;

function channel(image: RgbaImage, c: number): Plane {
  const data = new Float32Array(image.width * image.height);
  for (let i = 0; i < data.length; i++) data[i] = image.data[i * 4 + c] ?? 0;
  return { width: image.width, height: image.height, data };
}

/** The mean SSIM of one channel. */
export function ssimPlane(x: Plane, y: Plane): number {
  const { width, height } = x;
  if (width < 2 * SSIM_FRAME + 1 || height < 2 * SSIM_FRAME + 1) return Number.NaN;
  const g = gaussianKernel1d(SIGMA, TRUNCATE);
  const blur = (values: Float64Array): Float64Array => {
    const plane = { width, height, data: Float32Array.from(values) };
    return Float64Array.from(correlateSeparable(plane, g, g, "reflect").data);
  };
  const xs = Float64Array.from(x.data);
  const ys = Float64Array.from(y.data);
  const ux = blur(xs);
  const uy = blur(ys);
  const uxx = blur(xs.map((v) => v * v));
  const uyy = blur(ys.map((v) => v * v));
  const uxy = blur(xs.map((v, i) => v * (ys[i] ?? 0)));
  const c1 = (K1 * L) ** 2;
  const c2 = (K2 * L) ** 2;
  let sum = 0;
  let count = 0;
  for (let row = SSIM_FRAME; row < height - SSIM_FRAME; row++) {
    for (let col = SSIM_FRAME; col < width - SSIM_FRAME; col++) {
      const i = row * width + col;
      const mx = ux[i] ?? 0;
      const my = uy[i] ?? 0;
      const vx = (uxx[i] ?? 0) - mx * mx;
      const vy = (uyy[i] ?? 0) - my * my;
      const vxy = (uxy[i] ?? 0) - mx * my;
      sum += ((2 * mx * my + c1) * (2 * vxy + c2)) / ((mx * mx + my * my + c1) * (vx + vy + c2));
      count++;
    }
  }
  return sum / count;
}

/** The four metrics of `image` against `reference`. Both must have the same size. */
export function qualityMetrics(image: RgbaImage, reference: RgbaImage): QualityMetrics {
  if (image.width !== reference.width || image.height !== reference.height) {
    throw new RangeError("The images must have the same size.");
  }
  let squares = 0;
  let absolute = 0;
  const n = image.width * image.height;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const d = (image.data[i * 4 + c] ?? 0) - (reference.data[i * 4 + c] ?? 0);
      squares += d * d;
      absolute += Math.abs(d);
    }
  }
  const mse = squares / (3 * n);
  const mae = absolute / (3 * n);
  const psnr = mse === 0 ? Infinity : 10 * Math.log10((L * L) / mse);
  let ssim = 0;
  for (let c = 0; c < 3; c++) ssim += ssimPlane(channel(image, c), channel(reference, c));
  return { mse, mae, psnr, ssim: ssim / 3 };
}
