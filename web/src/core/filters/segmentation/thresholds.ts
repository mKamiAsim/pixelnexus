/**
 * Global and local thresholds. Catalog entries: catalog/filters/segmentation/{threshold-global,
 * otsu,threshold-adaptive-mean,threshold-adaptive-gaussian,niblack,sauvola}.yaml.
 *
 * Every threshold gives 255 where the value is above the threshold T and 0 elsewhere, or the
 * other way around with Invert. The local thresholds follow scikit-image:
 *
 * - Adaptive mean: T = mean of the size x size window - offset (threshold_local, "mean").
 * - Adaptive Gaussian: T = Gaussian blur with sigma = (size - 1) / 6, cut at 4 sigma, - offset
 *   (threshold_local, "gaussian").
 * - Niblack: T = m + k s, with the window mean m and population standard deviation s.
 * - Sauvola: T = m (1 + k (s / R - 1)).
 *
 * Otsu picks the global threshold t that maximizes the between-class variance of the levels at
 * or below t and those above it. Ties go to the smallest t, as in OpenCV and scikit-image.
 */
import { localMoments } from "@/core/filters/adaptive/local-stats";
import { boxMean, correlateSeparable } from "@/core/filters/convolve";
import { histogram256 } from "@/core/filters/enhancement/histogram";
import { gaussianKernel1d } from "@/core/filters/linear/gaussian";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter, type Representation } from "@/core/filters/types";

const invertOf = (params: Params) => read.boolean(params, "invert", false);

/** 255 where value > threshold, 0 elsewhere, or the reverse with invert. */
function binarize(input: Plane, threshold: (i: number) => number, invert: boolean): Plane {
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < input.data.length; i++) {
    const above = (input.data[i] ?? 0) > threshold(i);
    out.data[i] = above !== invert ? 255 : 0;
  }
  return out;
}

const RESULT_NOTE =
  "The result is 255 above the threshold and 0 at or below it. Invert swaps them.";

function stages(steps: { name: string; formula: string; note?: string }[]): Representation {
  return { kind: "stages", stages: steps, note: RESULT_NOTE };
}

// Global ----------------------------------------------------------------------------------------

export const thresholdGlobalFilter: PlaneFilter = {
  id: "threshold-global",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 0,
  plane: (input, params) => {
    const t = read.number(params, "threshold", 128);
    return binarize(input, () => t, invertOf(params));
  },
  representation: (params) =>
    stages([
      {
        name: "Threshold",
        formula: `I_{\\text{out}} = \\begin{cases} 255 & I > ${read.number(params, "threshold", 128)} \\\\ 0 & \\text{otherwise} \\end{cases}`,
      },
    ]),
};

/**
 * Otsu's threshold of a histogram of levels: values above it are the bright class. Only the
 * levels from the lowest to the highest one present are tried, as in scikit-image, so a flat
 * image gets its own level and turns all 0.
 */
export function otsuThreshold(histogram: ArrayLike<number>): number {
  let lo = 0;
  while (lo < 255 && !((histogram[lo] ?? 0) > 0)) lo++;
  let hi = 255;
  while (hi > lo && !((histogram[hi] ?? 0) > 0)) hi--;
  if (hi <= lo) return lo;
  let total = 0;
  let sum = 0;
  for (let k = lo; k <= hi; k++) {
    total += histogram[k] ?? 0;
    sum += k * (histogram[k] ?? 0);
  }
  let w0 = 0;
  let sum0 = 0;
  let best = lo;
  let bestVariance = -1;
  for (let t = lo; t < hi; t++) {
    w0 += histogram[t] ?? 0;
    sum0 += t * (histogram[t] ?? 0);
    const w1 = total - w0;
    const variance = w0 * w1 * (sum0 / w0 - (sum - sum0) / w1) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

export const otsuFilter: PlaneFilter = {
  id: "otsu",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params) => {
    const t = otsuThreshold(histogram256(input));
    return binarize(input, () => t, invertOf(params));
  },
  representation: () =>
    stages([
      {
        name: "Between-class variance",
        formula:
          "\\sigma_B^2(t) = \\omega_0(t)\\, \\omega_1(t)\\, \\left(\\mu_0(t) - \\mu_1(t)\\right)^2",
        note: "omega and mu are the share and the mean of the levels at or below t, and of those above.",
      },
      {
        name: "Threshold",
        formula:
          "t^* = \\arg\\max_t \\sigma_B^2(t),\\quad I_{\\text{out}} = 255 \\text{ where } I > t^*",
      },
    ]),
};

// Local ---------------------------------------------------------------------------------------

const sizeOf = (params: Params) => read.number(params, "size", 15);
const offsetOf = (params: Params) => read.number(params, "offset", 5);

export const adaptiveMeanFilter: PlaneFilter = {
  id: "threshold-adaptive-mean",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, { border }) => {
    const mean = boxMean(input, sizeOf(params), border);
    const c = offsetOf(params);
    return binarize(input, (i) => (mean.data[i] ?? 0) - c, invertOf(params));
  },
  representation: (params) =>
    stages([
      {
        name: "Local threshold",
        formula: `T(x, y) = \\operatorname{mean}_{${sizeOf(params)} \\times ${sizeOf(params)}}(I) - ${offsetOf(params)}`,
      },
    ]),
};

/** The sigma that scikit-image's threshold_local derives from the block size. */
export const gaussianSigmaOf = (size: number) => (size - 1) / 6;

export function gaussianMean(input: Plane, size: number, border: BorderMode): Plane {
  const g = gaussianKernel1d(gaussianSigmaOf(size), 4);
  return correlateSeparable(input, g, g, border);
}

export const adaptiveGaussianFilter: PlaneFilter = {
  id: "threshold-adaptive-gaussian",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => Math.floor(4 * gaussianSigmaOf(sizeOf(params)) + 0.5),
  plane: (input, params, { border }) => {
    const mean = gaussianMean(input, sizeOf(params), border);
    const c = offsetOf(params);
    return binarize(input, (i) => (mean.data[i] ?? 0) - c, invertOf(params));
  },
  representation: (params) =>
    stages([
      {
        name: "Local threshold",
        formula: `T = G_{\\sigma} * I - ${offsetOf(params)},\\quad \\sigma = \\frac{${sizeOf(params)} - 1}{6}`,
        note: "The Gaussian is cut at 4 sigma.",
      },
    ]),
};

function momentFilter(
  threshold: (mean: number, std: number, params: Params) => number,
  formula: (params: Params) => string,
) {
  return {
    kind: "derived" as const,
    alphaWeighted: false,
    radius: (params: Params) => (sizeOf(params) - 1) >> 1,
    plane: (input: Plane, params: Params, { border }: { border: BorderMode }) => {
      const { mean, variance } = localMoments(input, (sizeOf(params) - 1) >> 1, border);
      return binarize(
        input,
        (i) => threshold(mean[i] ?? 0, Math.sqrt(variance[i] ?? 0), params),
        invertOf(params),
      );
    },
    representation: (params: Params) =>
      stages([
        {
          name: "Local mean and deviation",
          formula: `m, s \\text{ over the } ${sizeOf(params)} \\times ${sizeOf(params)} \\text{ window}`,
          note: "s is the population standard deviation.",
        },
        { name: "Local threshold", formula: formula(params) },
      ]),
  };
}

export const niblackFilter: PlaneFilter = {
  id: "niblack",
  ...momentFilter(
    (m, s, params) => m + read.number(params, "k", -0.2) * s,
    (params) => `T = m + k\\, s,\\quad k = ${read.number(params, "k", -0.2)}`,
  ),
};

export const sauvolaFilter: PlaneFilter = {
  id: "sauvola",
  ...momentFilter(
    (m, s, params) =>
      m * (1 + read.number(params, "k", 0.5) * (s / read.number(params, "r", 128) - 1)),
    (params) =>
      `T = m \\left(1 + k \\left(\\frac{s}{R} - 1\\right)\\right),\\quad k = ${read.number(params, "k", 0.5)},\\ R = ${read.number(params, "r", 128)}`,
  ),
};
