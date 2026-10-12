/**
 * Gaussian filter. Catalog entry: catalog/filters/linear/gaussian.yaml.
 *
 * The filter runs as two 1D passes with gaussianKernel1d. The Inspector shows the same kernel,
 * built by the same function, so the shown matrix is the one that runs.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import type { BorderMode, Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** Window radius in pixels: floor(truncate * sigma + 0.5). This matches SciPy. */
export function gaussianRadius(sigma: number, truncate = 3): number {
  if (!(sigma > 0) || !(truncate > 0)) {
    throw new RangeError("sigma and truncate must be positive.");
  }
  return Math.floor(truncate * sigma + 0.5);
}

/**
 * Normalized 1D Gaussian weights g_i for i from -r to r. They add up to 1.
 * The 2D kernel used by the filter is the outer product of this kernel with itself.
 */
export function gaussianKernel1d(sigma: number, truncate = 3): Float64Array {
  const radius = gaussianRadius(sigma, truncate);
  const weights = new Float64Array(2 * radius + 1);
  const twoSigmaSquared = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / twoSigmaSquared);
    weights[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < weights.length; i++) weights[i] = (weights[i] ?? 0) / sum;
  return weights;
}

/** The 2D kernel as rows, for display. Entry [j][i] is g_i times g_j. */
export function gaussianKernel2d(sigma: number, truncate = 3): number[][] {
  const g = gaussianKernel1d(sigma, truncate);
  return Array.from(g, (gj) => Array.from(g, (gi) => gi * gj));
}

/** Blur one plane. Equal to scipy.ndimage.gaussian_filter with the matching border mode. */
export function gaussianPlane(
  input: Plane,
  sigma: number,
  truncate: number,
  border: BorderMode,
): Plane {
  const kernel = gaussianKernel1d(sigma, truncate);
  return correlateSeparable(input, kernel, kernel, border);
}

const sigmaOf = (params: Params) => read.number(params, "sigma", 1);
const truncateOf = (params: Params) => read.number(params, "truncate", 3);

export const gaussianFilter: PlaneFilter = {
  id: "gaussian",
  kind: "smooth",
  alphaWeighted: true,
  radius: (params) => gaussianRadius(sigmaOf(params), truncateOf(params)),
  plane: (input, params, context) =>
    gaussianPlane(input, sigmaOf(params), truncateOf(params), context.border),
  representation: (params) => {
    const g = Array.from(gaussianKernel1d(sigmaOf(params), truncateOf(params)));
    const r = (g.length - 1) / 2;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "G",
          rows: gaussianKernel2d(sigmaOf(params), truncateOf(params)),
          anchor: { x: r, y: r },
          normalized: true,
          separable: { column: g, row: g },
          note: "The 2D kernel is the outer product of the 1D kernel with itself.",
        },
      ],
    };
  },
};
