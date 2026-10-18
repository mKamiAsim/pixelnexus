/**
 * Difference of Gaussians and Laplacian of Gaussian. Catalog entries:
 * catalog/filters/linear/dog.yaml and log.yaml.
 *
 * DoG subtracts a wide Gaussian blur from a narrow one: G(sigma) * I - G(k sigma) * I. It is a
 * band-pass filter and approximates the scale-normalized Laplacian of Gaussian when k is near 1.
 *
 * LoG is the sum of the second derivatives of a Gaussian blur, d2/dx2 + d2/dy2. It runs as two
 * separable passes, the second derivative kernel along one axis and the Gaussian along the
 * other, with the kernels of scipy.ndimage.gaussian_laplace: the normalized Gaussian phi times
 * (x^2 / sigma^4 - 1 / sigma^2), truncated at 4 sigma.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { createPlane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { gaussianKernel1d, gaussianRadius } from "./gaussian";

const sigmaOf = (params: Params) => read.number(params, "sigma", 1.5);
const ratioOf = (params: Params) => read.number(params, "ratio", 1.6);

/** DoG truncates both Gaussians at 3 sigma, like the Gaussian filter. */
const DOG_TRUNCATE = 3;
/** LoG truncates at 4 sigma, the default of scipy.ndimage.gaussian_laplace. */
export const LOG_TRUNCATE = 4;

/** The 1D second derivative of the normalized Gaussian, as in SciPy. */
export function gaussianSecondDerivative(sigma: number, truncate = LOG_TRUNCATE): Float64Array {
  const r = gaussianRadius(sigma, truncate);
  const g = gaussianKernel1d(sigma, truncate);
  const s2 = sigma * sigma;
  return Float64Array.from(g, (phi, i) => phi * ((i - r) ** 2 / (s2 * s2) - 1 / s2));
}

export const dogFilter: PlaneFilter = {
  id: "dog",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(sigmaOf(params) * ratioOf(params), DOG_TRUNCATE),
  plane: (input, params, { border }) => {
    const s = sigmaOf(params);
    const narrow = gaussianKernel1d(s, DOG_TRUNCATE);
    const wide = gaussianKernel1d(s * ratioOf(params), DOG_TRUNCATE);
    const a = correlateSeparable(input, narrow, narrow, border);
    const b = correlateSeparable(input, wide, wide, border);
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) out.data[i] = (a.data[i] ?? 0) - (b.data[i] ?? 0);
    return out;
  },
  representation: (params) => {
    const s = sigmaOf(params);
    const k = ratioOf(params);
    const r = gaussianRadius(s * k, DOG_TRUNCATE);
    const pad = (w: Float64Array) => {
      const extra = r - ((w.length - 1) >> 1);
      return [...Array<number>(extra).fill(0), ...w, ...Array<number>(extra).fill(0)];
    };
    const narrow = pad(gaussianKernel1d(s, DOG_TRUNCATE));
    const wide = pad(gaussianKernel1d(s * k, DOG_TRUNCATE));
    const rows = narrow.map((a, j) =>
      narrow.map((b, i) => a * b - (wide[j] ?? 0) * (wide[i] ?? 0)),
    );
    return {
      kind: "kernels",
      kernels: [
        {
          name: "D",
          rows,
          anchor: { x: r, y: r },
          normalized: false,
          note: `The narrow Gaussian with sigma ${s} minus the wide one with sigma ${Number((s * k).toFixed(4))}. The weights add up to 0, so flat areas give 0.`,
        },
      ],
    };
  },
};

export const logFilter: PlaneFilter = {
  id: "log",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(sigmaOf(params), LOG_TRUNCATE),
  plane: (input, params, { border }) => {
    const s = sigmaOf(params);
    const g = gaussianKernel1d(s, LOG_TRUNCATE);
    const d2 = gaussianSecondDerivative(s);
    const xx = correlateSeparable(input, d2, g, border);
    const yy = correlateSeparable(input, g, d2, border);
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) out.data[i] = (xx.data[i] ?? 0) + (yy.data[i] ?? 0);
    return out;
  },
  representation: (params) => {
    const s = sigmaOf(params);
    const g = gaussianKernel1d(s, LOG_TRUNCATE);
    const d2 = gaussianSecondDerivative(s);
    const r = (g.length - 1) >> 1;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "\\nabla^2 G",
          rows: Array.from(g, (gy, j) =>
            Array.from(g, (gx, i) => (d2[i] ?? 0) * gy + gx * (d2[j] ?? 0)),
          ),
          anchor: { x: r, y: r },
          normalized: false,
          note: `The second derivative of the Gaussian along x times the Gaussian along y, plus the same along y. Sigma ${s}, truncated at 4 sigma.`,
        },
      ],
    };
  },
};
