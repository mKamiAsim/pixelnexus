/**
 * Speckle filters for multiplicative noise. Catalog entries: catalog/filters/adaptive/lee.yaml,
 * enhanced-lee.yaml, kuan.yaml, frost.yaml and gamma-map.yaml.
 *
 * Speckle multiplies the signal by noise of mean 1. Its coefficient of variation C_u, the noise
 * standard deviation over its mean, is the parameter. For an L-look intensity image, C_u is
 * 1 / sqrt(L). In every window the filters compare C_u with the local coefficient of variation
 * C_I = sigma / mean. Where C_I is close to C_u, the window is taken as flat and smoothed. Where
 * it is much larger, there is structure, and the pixel is kept. The forms follow Lopes, Touzi and
 * Nezry (1990), and Lopes, Nezry, Touzi and Laur (1990) for Gamma-MAP:
 *
 *   Lee:           out = m + W (z - m),  W = 1 - C_u^2 / C_I^2
 *   Kuan:          W = (1 - C_u^2 / C_I^2) / (1 + C_u^2)
 *   Enhanced Lee:  three classes split at C_u and C_max = sqrt(1 + 2 C_u^2)
 *   Gamma-MAP:     the MAP estimate for gamma-distributed signal and speckle, same classes
 *   Frost:         a weighted mean with weights exp(-K C_I^2 d), d the distance to the center
 *
 * W is limited to 0 and 1, so a window that varies less than the speckle gives its mean.
 */
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { gatherPlane } from "@/core/filters/nonlinear/window";
import { read, type Params, type PlaneFilter, type Representation } from "@/core/filters/types";

import { localMoments } from "./local-stats";

const sizeOf = (params: Params) => read.number(params, "size", 7);
const cuOf = (params: Params) => read.number(params, "cu", 0.25);
const dampingOf = (params: Params) => read.number(params, "damping", 1);
const radiusOf = (params: Params) => (sizeOf(params) - 1) >> 1;

/** The local mean m and coefficient of variation C_I of every window. */
export function localVariation(
  input: Plane,
  radius: number,
  border: BorderMode,
): { mean: Float64Array; ci: Float64Array } {
  const { mean, variance } = localMoments(input, radius, border);
  const ci = mean.map((m, i) => (m > 0 ? Math.sqrt(variance[i] ?? 0) / m : 0));
  return { mean, ci };
}

/** The largest coefficient of variation of pure speckle, sqrt(1 + 2 C_u^2). */
export const cMax = (cu: number) => Math.sqrt(1 + 2 * cu * cu);

export function leeWeight(ci: number, cu: number): number {
  return ci > 0 ? Math.min(1, Math.max(0, 1 - (cu * cu) / (ci * ci))) : 0;
}

export function kuanWeight(ci: number, cu: number): number {
  return ci > 0 ? Math.max(0, (1 - (cu * cu) / (ci * ci)) / (1 + cu * cu)) : 0;
}

/** Enhanced Lee: the mean below C_u, the pixel above C_max, a smooth blend between. */
export function enhancedLeeValue(z: number, m: number, ci: number, cu: number, k: number): number {
  const max = cMax(cu);
  if (ci <= cu) return m;
  if (ci >= max) return z;
  const w = Math.exp((-k * (ci - cu)) / (max - ci));
  return m * w + z * (1 - w);
}

/** Gamma-MAP: the larger root of alpha R^2 - (alpha - L - 1) m R - L z m = 0. */
export function gammaMapValue(z: number, m: number, ci: number, cu: number): number {
  const max = cMax(cu);
  if (ci <= cu) return m;
  if (ci >= max) return z;
  const looks = 1 / (cu * cu);
  const alpha = (1 + cu * cu) / (ci * ci - cu * cu);
  const b = alpha - looks - 1;
  return (b * m + Math.sqrt(m * m * b * b + 4 * alpha * looks * z * m)) / (2 * alpha);
}

function pointwise(
  input: Plane,
  params: Params,
  border: BorderMode,
  rule: (z: number, m: number, ci: number) => number,
): Plane {
  const { mean, ci } = localVariation(input, radiusOf(params), border);
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = rule(input.data[i] ?? 0, mean[i] ?? 0, ci[i] ?? 0);
  }
  return out;
}

const rep = (params: Params, statistic: string, note: string): Representation => ({
  kind: "window",
  size: sizeOf(params),
  count: sizeOf(params) ** 2,
  statistic,
  note: `m is the window mean and C_I its coefficient of variation. C_u = ${cuOf(params)}. ${note}`,
});

const base = {
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
} as const;

export const leeFilter: PlaneFilter = {
  ...base,
  id: "lee",
  plane: (input, params, { border }) =>
    pointwise(input, params, border, (z, m, ci) => m + leeWeight(ci, cuOf(params)) * (z - m)),
  representation: (params) =>
    rep(
      params,
      "m + \\Bigl(1 - \\frac{C_u^2}{C_I^2}\\Bigr)(z - m)",
      "The weight is limited to 0 and 1, so a window that varies less than the speckle gives m.",
    ),
};

export const kuanFilter: PlaneFilter = {
  ...base,
  id: "kuan",
  plane: (input, params, { border }) =>
    pointwise(input, params, border, (z, m, ci) => m + kuanWeight(ci, cuOf(params)) * (z - m)),
  representation: (params) =>
    rep(
      params,
      "m + \\frac{1 - C_u^2 / C_I^2}{1 + C_u^2}(z - m)",
      "The weight is at least 0. It is the Lee weight divided by 1 + C_u^2.",
    ),
};

export const enhancedLeeFilter: PlaneFilter = {
  ...base,
  id: "enhanced-lee",
  plane: (input, params, { border }) =>
    pointwise(input, params, border, (z, m, ci) =>
      enhancedLeeValue(z, m, ci, cuOf(params), dampingOf(params)),
    ),
  representation: (params) =>
    rep(
      params,
      `m\\,W + z(1 - W),\\; W = e^{-${dampingOf(params)}\\frac{C_I - C_u}{C_{\\max} - C_I}}`,
      `Below C_u the output is m, above C_max = ${cMax(cuOf(params)).toFixed(4)} it is z, and between the weight W blends them.`,
    ),
};

export const gammaMapFilter: PlaneFilter = {
  ...base,
  id: "gamma-map",
  plane: (input, params, { border }) =>
    pointwise(input, params, border, (z, m, ci) => gammaMapValue(z, m, ci, cuOf(params))),
  representation: (params) =>
    rep(
      params,
      "\\frac{(\\alpha - L - 1)m + \\sqrt{m^2(\\alpha - L - 1)^2 + 4\\alpha L z m}}{2\\alpha}",
      `L = 1 / C_u^2 and alpha = (1 + C_u^2) / (C_I^2 - C_u^2). Below C_u the output is m, above C_max = ${cMax(cuOf(params)).toFixed(4)} it is z.`,
    ),
};

export const frostFilter: PlaneFilter = {
  ...base,
  id: "frost",
  plane: (input, params, { border }) => {
    const r = radiusOf(params);
    const size = 2 * r + 1;
    const k = dampingOf(params);
    const { ci } = localVariation(input, r, border);
    const distance = Float64Array.from({ length: size * size }, (_, q) =>
      Math.hypot((q % size) - r, Math.floor(q / size) - r),
    );
    const width = input.width;
    return gatherPlane(input, r, border, (window, x, y) => {
      const c = ci[y * width + x] ?? 0;
      const b = k * c * c;
      let sum = 0;
      let total = 0;
      for (let q = 0; q < size * size; q++) {
        const w = Math.exp(-b * (distance[q] ?? 0));
        sum += w * (window[q] ?? 0);
        total += w;
      }
      return sum / total;
    });
  },
  representation: (params) => ({
    kind: "window",
    size: sizeOf(params),
    count: sizeOf(params) ** 2,
    statistic: `\\frac{\\sum_q e^{-${dampingOf(params)} C_I^2 d_q} I_q}{\\sum_q e^{-${dampingOf(params)} C_I^2 d_q}}`,
    note: "d_q is the distance of window pixel q from the center. In flat areas C_I is small and the weights are nearly equal, a box mean. In busy areas the weights fall off fast, and the pixel keeps its value.",
  }),
};
