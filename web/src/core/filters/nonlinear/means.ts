/**
 * Mean filters for noise of known kinds, as in Gonzalez and Woods, chapter 5. Catalog entries:
 * catalog/filters/nonlinear/geometric-mean.yaml, harmonic-mean.yaml, contraharmonic-mean.yaml
 * and alpha-trimmed-mean.yaml.
 *
 * The geometric, harmonic and contraharmonic means are ratios of window sums, so they run with
 * running sums in float64. A 0 in the window makes the geometric and harmonic means 0, and also
 * the contraharmonic mean when Q is negative. That is the limit of each formula as the value
 * goes to 0. The alpha-trimmed mean drops the t smallest and t largest values and averages the
 * rest, from a sliding histogram of whole values.
 */
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { histogramPlane, windowSumOf } from "./window";

const sizeOf = (params: Params) => read.number(params, "size", 3);
const radiusOf = (params: Params) => (sizeOf(params) - 1) >> 1;

/** Count of zeros (or smaller values) in each window. */
const zeroCounts = (input: Plane, radius: number, border: BorderMode) =>
  windowSumOf(input, radius, border, (v) => (v <= 0 ? 1 : 0));

const fromArray = (width: number, height: number, values: (i: number) => number): Plane => {
  const out = createPlane(width, height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = values(i);
  return out;
};

/** The window is "nonzero" when its zero count is below one half, which survives rounding. */
const hasZero = (zeros: Float64Array, i: number) => (zeros[i] ?? 0) > 0.5;

export const geometricMeanFilter: PlaneFilter = {
  id: "geometric-mean",
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) => {
    const r = radiusOf(params);
    const n = sizeOf(params) ** 2;
    const logs = windowSumOf(input, r, border, (v) => (v > 0 ? Math.log(v) : 0));
    const zeros = zeroCounts(input, r, border);
    return fromArray(input.width, input.height, (i) =>
      hasZero(zeros, i) ? 0 : Math.exp((logs[i] ?? 0) / n),
    );
  },
  representation: (params) => ({
    kind: "window",
    size: sizeOf(params),
    count: sizeOf(params) ** 2,
    statistic: "\\Bigl(\\prod_{w \\in W} w\\Bigr)^{1/n}",
    note: "The n-th root of the product of the n window values W. It runs as exp of the mean of the logarithms. A 0 in the window gives 0.",
  }),
};

export const harmonicMeanFilter: PlaneFilter = {
  id: "harmonic-mean",
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) => {
    const r = radiusOf(params);
    const n = sizeOf(params) ** 2;
    const inverses = windowSumOf(input, r, border, (v) => (v > 0 ? 1 / v : 0));
    const zeros = zeroCounts(input, r, border);
    return fromArray(input.width, input.height, (i) =>
      hasZero(zeros, i) ? 0 : n / (inverses[i] ?? 1),
    );
  },
  representation: (params) => ({
    kind: "window",
    size: sizeOf(params),
    count: sizeOf(params) ** 2,
    statistic: "\\frac{n}{\\sum_{w \\in W} 1/w}",
    note: "n divided by the sum of the inverses of the window values W. A 0 in the window gives 0.",
  }),
};

export function contraharmonicPlane(
  input: Plane,
  radius: number,
  q: number,
  border: BorderMode,
): Plane {
  const power = (p: number) => (v: number) => (v > 0 ? v ** p : p === 0 ? 1 : 0);
  const top = windowSumOf(input, radius, border, power(q + 1));
  const bottom = windowSumOf(input, radius, border, power(q));
  const zeros = q < 0 ? zeroCounts(input, radius, border) : null;
  return fromArray(input.width, input.height, (i) => {
    if (zeros && hasZero(zeros, i)) return 0;
    const b = bottom[i] ?? 0;
    return b > 0 ? (top[i] ?? 0) / b : 0;
  });
}

export const contraharmonicMeanFilter: PlaneFilter = {
  id: "contraharmonic-mean",
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) =>
    contraharmonicPlane(input, radiusOf(params), read.number(params, "order", 1.5), border),
  representation: (params) => {
    const q = read.number(params, "order", 1.5);
    return {
      kind: "window",
      size: sizeOf(params),
      count: sizeOf(params) ** 2,
      statistic: `\\frac{\\sum_{w \\in W} w^{${q + 1}}}{\\sum_{w \\in W} w^{${q}}}`,
      note:
        q > 0
          ? `With Q = ${q} the bright values weigh more, so dark specks (pepper) are removed.`
          : q < 0
            ? `With Q = ${q} the dark values weigh more, so bright specks (salt) are removed. A 0 in the window gives 0.`
            : "With Q = 0 this is the plain mean of the window.",
    };
  },
};

/** Values dropped at each end, at most (n - 1) / 2 so that one value is left. */
export function trimOf(params: Params): number {
  const n = sizeOf(params) ** 2;
  return Math.min((n - 1) / 2, Math.max(0, Math.round(read.number(params, "trim", 2))));
}

export const alphaTrimmedMeanFilter: PlaneFilter = {
  id: "alpha-trimmed-mean",
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, { border }) => {
    const t = trimOf(params);
    return histogramPlane(input, radiusOf(params), border, (hist, count) => {
      // Skip t values from the bottom, then add up the next count - 2t values.
      let skip = t;
      let take = count - 2 * t;
      let sum = 0;
      for (let v = 0; v < 256 && take > 0; v++) {
        let c = hist[v] ?? 0;
        const skipped = Math.min(skip, c);
        skip -= skipped;
        c -= skipped;
        const used = Math.min(take, c);
        sum += used * v;
        take -= used;
      }
      return sum / (count - 2 * t);
    });
  },
  representation: (params) => {
    const n = sizeOf(params) ** 2;
    const t = trimOf(params);
    return {
      kind: "rank",
      size: sizeOf(params),
      count: n,
      rank: t + 1,
      rankTo: n - t,
      note: `The ${t} smallest and the ${t} largest values are dropped. The output is the mean of the ${n - 2 * t} values left.`,
    };
  },
};
