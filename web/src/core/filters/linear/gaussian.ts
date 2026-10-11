/**
 * Gaussian filter. Catalog entry: catalog/filters/linear/gaussian.yaml.
 *
 * Phase 2 adds only the kernel generator, which the style tile and the Inspector use.
 * The filter itself (gaussianFilter) arrives in Phase 3.
 */

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
