/**
 * Local statistics maps. Catalog entries: catalog/filters/adaptive/local-variance.yaml,
 * local-std.yaml, local-range.yaml and local-entropy.yaml.
 *
 * Each output pixel is a statistic of the size x size window around it. The results are new
 * quantities, not smoothed images, so they go through the output mapping.
 *
 * - Variance: E[w^2] - E[w]^2, the population variance, from running sums in float64.
 * - Standard deviation: the square root of the variance.
 * - Range: max - min, from the separable min and max passes.
 * - Entropy: -sum p log2 p over the 256-bin histogram of the window, in bits. Values are
 *   rounded to whole numbers first. It is the measure of skimage.filters.rank.entropy.
 */
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter, type Representation } from "@/core/filters/types";
import { extremePlane, histogramPlane, windowSumOf } from "@/core/filters/nonlinear/window";

const sizeOf = (params: Params) => read.number(params, "size", 5);
const radiusOf = (params: Params) => (sizeOf(params) - 1) >> 1;

/** The local mean and population variance of every window, in float64. */
export function localMoments(
  input: Plane,
  radius: number,
  border: BorderMode,
): { mean: Float64Array; variance: Float64Array } {
  const n = (2 * radius + 1) ** 2;
  const sums = windowSumOf(input, radius, border, (v) => v);
  const squares = windowSumOf(input, radius, border, (v) => v * v);
  const mean = sums.map((s) => s / n);
  const variance = squares.map((s, i) => Math.max(0, s / n - (mean[i] ?? 0) ** 2));
  return { mean, variance };
}

/** -sum p log2 p of a histogram with `count` values. */
export function histogramEntropy(hist: ArrayLike<number>, count: number): number {
  let h = 0;
  for (let v = 0; v < 256; v++) {
    const c = hist[v] ?? 0;
    if (c > 0) h -= (c / count) * Math.log2(c / count);
  }
  return h;
}

const fromArray = (input: Plane, values: Float64Array): Plane => {
  const out = createPlane(input.width, input.height);
  out.data.set(values);
  return out;
};

const windowRep = (params: Params, statistic: string, note: string): Representation => ({
  kind: "window",
  size: sizeOf(params),
  count: sizeOf(params) ** 2,
  statistic,
  note,
});

export const localVarianceFilter: PlaneFilter = {
  id: "local-variance",
  kind: "derived",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) =>
    fromArray(input, localMoments(input, radiusOf(params), border).variance),
  representation: (params) =>
    windowRep(
      params,
      "\\frac{1}{n}\\sum_{w \\in W} w^2 - \\Bigl(\\frac{1}{n}\\sum_{w \\in W} w\\Bigr)^2",
      "The population variance of the window, in squared levels. It can reach 16256, so the output mapping scales it.",
    ),
};

export const localStdFilter: PlaneFilter = {
  id: "local-std",
  kind: "derived",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) =>
    fromArray(input, localMoments(input, radiusOf(params), border).variance.map(Math.sqrt)),
  representation: (params) =>
    windowRep(
      params,
      "\\sqrt{\\operatorname{Var} W}",
      "The square root of the population variance of the window, in levels. It is at most 127.5.",
    ),
};

export const localRangeFilter: PlaneFilter = {
  id: "local-range",
  kind: "derived",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) => {
    const r = radiusOf(params);
    const low = extremePlane(input, r, border, "min");
    const high = extremePlane(input, r, border, "max");
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++)
      out.data[i] = (high.data[i] ?? 0) - (low.data[i] ?? 0);
    return out;
  },
  representation: (params) =>
    windowRep(
      params,
      "\\max W - \\min W",
      "The difference between the largest and the smallest value of the window.",
    ),
};

export const localEntropyFilter: PlaneFilter = {
  id: "local-entropy",
  kind: "derived",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) =>
    histogramPlane(input, radiusOf(params), border, (hist, count) => histogramEntropy(hist, count)),
  representation: (params) =>
    windowRep(
      params,
      "-\\sum_{v} p_v \\log_2 p_v",
      `p_v is the share of the window with value v. The result is in bits, at most log2(${sizeOf(params) ** 2}) = ${Math.log2(sizeOf(params) ** 2).toFixed(2)} for this window.`,
    ),
};
