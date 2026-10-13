/**
 * Bilateral filter (Tomasi and Manduchi, 1998). Catalog entry: catalog/filters/nonlinear/bilateral.yaml.
 *
 * Each output is a weighted mean of the window. A weight is the product of a spatial Gaussian,
 * which falls with the distance to the center, and a range Gaussian, which falls with the
 * difference in value to the center:
 *
 *   w(p, q) = exp(-|p - q|^2 / (2 sigma_s^2)) exp(-d(I_p, I_q)^2 / (2 sigma_r^2))
 *
 * The window is the disk of radius ceil(3 sigma_s), as in OpenCV's bilateralFilter. In the
 * channel mode, d is the difference within each channel, and each channel gets its own weights.
 * In the color mode, d is the Euclidean distance between RGB colors, and all channels share the
 * weights, the vector bilateral filter. A guide plane, as in the joint bilateral filter, replaces
 * the image in d.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

export type RangeMode = "channel" | "color";

export const sigmaSpaceOf = (params: Params) => read.number(params, "sigmaSpace", 3);
export const sigmaRangeOf = (params: Params) => read.number(params, "sigmaRange", 30);

/** The window radius: 3 sigma_s, rounded up. */
export const bilateralRadius = (sigmaSpace: number) => Math.max(1, Math.ceil(3 * sigmaSpace));

/** Window offsets inside the disk, with their spatial weights. */
export function spatialTaps(sigmaSpace: number): { dx: number; dy: number; w: number }[] {
  const r = bilateralRadius(sigmaSpace);
  const taps: { dx: number; dy: number; w: number }[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      taps.push({ dx, dy, w: Math.exp(-d2 / (2 * sigmaSpace * sigmaSpace)) });
    }
  }
  return taps;
}

/**
 * The weights at one pixel, for the Weight viewer. `window` holds values (or distances, for
 * the color mode, as the value difference) row by row around the center, of side 2r + 1.
 */
export function bilateralWeights(
  differences: readonly (readonly number[])[],
  sigmaSpace: number,
  sigmaRange: number,
): { spatial: number[][]; range: number[][]; combined: number[][] } {
  const r = (differences.length - 1) >> 1;
  const spatial = differences.map((row, j) =>
    row.map((_, i) => {
      const d2 = (i - r) ** 2 + (j - r) ** 2;
      return d2 > r * r ? 0 : Math.exp(-d2 / (2 * sigmaSpace * sigmaSpace));
    }),
  );
  const range = differences.map((row) =>
    row.map((d) => Math.exp(-(d * d) / (2 * sigmaRange * sigmaRange))),
  );
  const product = spatial.map((row, j) => row.map((s, i) => s * (range[j]?.[i] ?? 0)));
  const total = product.flat().reduce((a, b) => a + b, 0);
  return { spatial, range, combined: product.map((row) => row.map((v) => v / total)) };
}

/**
 * The bilateral sum on three planes. `guide` holds the planes that set the range weights: the
 * image itself, or a guide image for the joint bilateral filter.
 */
export function bilateralPlanes(
  planes: readonly [Plane, Plane, Plane],
  guide: readonly Plane[],
  mode: RangeMode,
  sigmaSpace: number,
  sigmaRange: number,
  border: BorderMode,
): [Plane, Plane, Plane] {
  const { width, height } = planes[0];
  const taps = spatialTaps(sigmaSpace);
  const r = bilateralRadius(sigmaSpace);
  const xs = borderTable(width, r, border);
  const ys = borderTable(height, r, border);
  const index = (x: number, y: number) => {
    const sx = xs[x + r] ?? -1;
    const sy = ys[y + r] ?? -1;
    return sx < 0 || sy < 0 ? -1 : sy * width + sx;
  };
  const value = (plane: Plane | undefined, i: number) => (i < 0 ? 0 : (plane?.data[i] ?? 0));
  const rangeCoeff = -1 / (2 * sigmaRange * sigmaRange);
  const out = [createPlane(width, height), createPlane(width, height), createPlane(width, height)];
  const sums = new Float64Array(3);
  const totals = new Float64Array(3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = y * width + x;
      sums.fill(0);
      totals.fill(0);
      for (const { dx, dy, w } of taps) {
        const i = index(x + dx, y + dy);
        if (mode === "color") {
          let d2 = 0;
          for (const g of guide) d2 += (value(g, i) - value(g, center)) ** 2;
          const weight = w * Math.exp(d2 * rangeCoeff);
          for (let c = 0; c < 3; c++) {
            sums[c] = (sums[c] ?? 0) + weight * value(planes[c], i);
            totals[c] = (totals[c] ?? 0) + weight;
          }
        } else {
          for (let c = 0; c < 3; c++) {
            const g = guide[Math.min(c, guide.length - 1)];
            const d = value(g, i) - value(g, center);
            const weight = w * Math.exp(d * d * rangeCoeff);
            sums[c] = (sums[c] ?? 0) + weight * value(planes[c], i);
            totals[c] = (totals[c] ?? 0) + weight;
          }
        }
      }
      for (let c = 0; c < 3; c++) {
        (out[c] as Plane).data[center] = (sums[c] ?? 0) / (totals[c] ?? 1);
      }
    }
  }
  return out as [Plane, Plane, Plane];
}

const modeOf = (params: Params) => read.string<RangeMode>(params, "range", "channel");

export const bilateralFilter: ColorFilter = {
  id: "bilateral",
  kind: "color",
  radius: (params) => bilateralRadius(sigmaSpaceOf(params)),
  color: (planes, params, { border }) =>
    bilateralPlanes(
      planes,
      planes,
      modeOf(params),
      sigmaSpaceOf(params),
      sigmaRangeOf(params),
      border,
    ),
  representation: (params) => {
    const s = sigmaSpaceOf(params);
    const r = bilateralRadius(s);
    return {
      kind: "window",
      size: 2 * r + 1,
      count: spatialTaps(s).length,
      statistic: `\\frac{\\sum_q w_{pq} I_q}{\\sum_q w_{pq}},\\; w_{pq} = e^{-\\frac{\\lVert p - q \\rVert^2}{2 \\cdot ${s}^2}}\\, e^{-\\frac{d(I_p, I_q)^2}{2 \\cdot ${sigmaRangeOf(params)}^2}}`,
      note:
        modeOf(params) === "color"
          ? "The window is the disk of radius 3 sigma_s. d is the distance between RGB colors, so all channels share the weights. The Weight viewer shows the weights at any pixel."
          : "The window is the disk of radius 3 sigma_s. d is the difference within each channel, so each channel has its own weights. The Weight viewer shows the weights at any pixel.",
    };
  },
};
