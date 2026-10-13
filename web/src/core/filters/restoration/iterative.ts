/**
 * Iterative deconvolution: Richardson-Lucy, Landweber and projected Landweber. Catalog entries:
 * catalog/filters/restoration/{richardson-lucy,landweber,nnls-deconv}.yaml.
 *
 * All three iterate on the image extended with the border mode, as the direct deconvolution
 * filters do, with convolutions through the FFT of the extended grid. The estimate starts as
 * the blurred image itself. The result is the last estimate, cropped to the image.
 *
 * - Richardson-Lucy: f <- f * (h' (x) (g / (h (x) f))), with h' the PSF turned by a half turn.
 *   Values of h (x) f below 1e-12 count as 1e-12, so the ratio stays finite.
 * - Landweber: f <- f + tau h' (x) (g - h (x) f).
 * - Projected Landweber: the Landweber step, then negative values are set to 0. This solves
 *   non-negative least squares.
 */
import { fft2d } from "@/core/math/fft";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { spectrumOf } from "@/core/filters/frequency/spectral";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { psfKernel, transferOf } from "./deconvolve";

/** Denominators of Richardson-Lucy below this count as this. */
export const RL_EPSILON = 1e-12;

export type Method = "richardson-lucy" | "landweber" | "projected-landweber";

/** The extended plane, the transfer function and helpers to convolve on the FFT grid. */
function setup(input: Plane, border: BorderMode, params: Params) {
  const spectrum = spectrumOf(input, border);
  const { width, height } = spectrum;
  const [hr, hi] = transferOf(psfKernel(params), width, height);
  // The extended plane itself: the inverse FFT of its spectrum.
  const g = new Float64Array(spectrum.re);
  const gi = new Float64Array(spectrum.im);
  fft2d(g, gi, height, width, true);
  const n = width * height;
  for (let k = 0; k < n; k++) g[k] = (g[k] ?? 0) / n;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  /** Convolve a grid with h, or with h turned by a half turn when `adjoint` is true. */
  const convolve = (values: Float64Array, adjoint: boolean): Float64Array => {
    re.set(values);
    im.fill(0);
    fft2d(re, im, height, width, false);
    for (let k = 0; k < n; k++) {
      const a = re[k] ?? 0;
      const b = im[k] ?? 0;
      const c = hr[k] ?? 0;
      const d = adjoint ? -(hi[k] ?? 0) : (hi[k] ?? 0);
      re[k] = a * c - b * d;
      im[k] = a * d + b * c;
    }
    fft2d(re, im, height, width, true);
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = (re[k] ?? 0) / n;
    return out;
  };
  return { spectrum, g, convolve, n };
}

/** One step of a method, in place on the estimate f. */
function step(
  method: Method,
  f: Float64Array,
  g: Float64Array,
  convolve: (values: Float64Array, adjoint: boolean) => Float64Array,
  tau: number,
): void {
  const blurred = convolve(f, false);
  if (method === "richardson-lucy") {
    const ratio = g.map((v, k) => v / Math.max(blurred[k] ?? 0, RL_EPSILON));
    const correction = convolve(ratio, true);
    for (let k = 0; k < f.length; k++) f[k] = (f[k] ?? 0) * (correction[k] ?? 0);
    return;
  }
  const residual = g.map((v, k) => v - (blurred[k] ?? 0));
  const correction = convolve(residual, true);
  for (let k = 0; k < f.length; k++) {
    const next = (f[k] ?? 0) + tau * (correction[k] ?? 0);
    f[k] = method === "projected-landweber" ? Math.max(0, next) : next;
  }
}

/**
 * Run a method for a number of iterations. `onIteration` gets each estimate, cropped to the image,
 * and the root mean square of g - h (x) f over the extended grid before the step, for the
 * Iteration viewer.
 */
export function iterate(
  input: Plane,
  border: BorderMode,
  params: Params,
  method: Method,
  onIteration?: (iteration: number, estimate: Plane, residual: number) => void,
): Plane {
  const { spectrum, g, convolve, n } = setup(input, border, params);
  const iterations = read.number(params, "iterations", 20);
  const tau = read.number(params, "tau", 1);
  const f = new Float64Array(g);
  if (method === "richardson-lucy") for (let k = 0; k < n; k++) f[k] = Math.max(0, f[k] ?? 0);
  const crop = (values: Float64Array): Plane => {
    const out = createPlane(input.width, input.height);
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        out.data[y * input.width + x] =
          values[(y + spectrum.top) * spectrum.width + x + spectrum.left] ?? 0;
      }
    }
    return out;
  };
  for (let i = 1; i <= iterations; i++) {
    if (onIteration) {
      const blurred = convolve(f, false);
      let sum = 0;
      for (let k = 0; k < n; k++) sum += ((g[k] ?? 0) - (blurred[k] ?? 0)) ** 2;
      step(method, f, g, convolve, tau);
      onIteration(i, crop(f), Math.sqrt(sum / n));
    } else {
      step(method, f, g, convolve, tau);
    }
  }
  return crop(f);
}

const UPDATE: Record<Method, string> = {
  "richardson-lucy":
    "f_{k+1} = f_k \\cdot \\left( h' \\circledast \\frac{g}{h \\circledast f_k} \\right)",
  landweber: "f_{k+1} = f_k + \\tau\\, h' \\circledast (g - h \\circledast f_k)",
  "projected-landweber":
    "f_{k+1} = \\max\\left(0,\\ f_k + \\tau\\, h' \\circledast (g - h \\circledast f_k)\\right)",
};

function iterativeFilter(id: string, method: Method): PlaneFilter {
  return {
    id,
    kind: "smooth",
    alphaWeighted: false,
    global: true,
    radius: () => 0,
    plane: (input, params, { border }) => iterate(input, border, params, method),
    representation: (params) => ({
      kind: "iterative",
      iterations: read.number(params, "iterations", 20),
      update:
        method === "richardson-lucy"
          ? UPDATE[method]
          : `${UPDATE[method]},\\quad \\tau = ${read.number(params, "tau", 1)}`,
      note: "h' is the PSF turned by a half turn, and the convolutions run through the FFT of the extended image. The first estimate f_0 is the blurred image g.",
    }),
  };
}

export const richardsonLucyFilter: PlaneFilter = {
  ...iterativeFilter("richardson-lucy", "richardson-lucy"),
  id: "richardson-lucy",
};
export const landweberFilter: PlaneFilter = {
  ...iterativeFilter("landweber", "landweber"),
  id: "landweber",
};
export const nnlsDeconvFilter: PlaneFilter = {
  ...iterativeFilter("nnls-deconv", "projected-landweber"),
  id: "nnls-deconv",
};
