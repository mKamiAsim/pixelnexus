/**
 * Scale-space filtering with the gamma-normalized derivatives of Lindeberg. Catalog entry:
 * catalog/filters/multiscale/scale-space.yaml.
 *
 * The scale space L(x, y; t) is the image blurred by a Gaussian of variance t = sigma^2. The
 * derivatives of L come from the derivative-of-Gaussian kernels of scipy.ndimage.gaussian_filter,
 * cut at 4 sigma. A normalized derivative of order m is the plain derivative times
 * t^(m gamma / 2) = sigma^(m gamma), so the three measures are:
 *
 *   gradient:  sigma^gamma |grad L|
 *   laplacian: sigma^(2 gamma) (L_xx + L_yy)
 *   hessian:   sigma^(4 gamma) (L_xx L_yy - L_xy^2)
 *
 * The stack holds `scales` values of sigma, spaced evenly in log sigma from `sigma` to
 * `sigmaMax`. At each pixel the response output is the measure at the scale where its absolute
 * value is largest, with its sign, and the scale output is that sigma. Ties go to the smaller
 * sigma.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { gaussianSecondDerivative } from "@/core/filters/linear/dog-log";
import { gaussianKernel1d, gaussianRadius } from "@/core/filters/linear/gaussian";
import { gaussianFirstDerivative } from "@/core/filters/linear/steerable";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** The kernels are cut at 4 sigma, the default of scipy.ndimage.gaussian_filter. */
const TRUNCATE = 4;

export type ScaleMeasure = "gradient" | "laplacian" | "hessian";

/** `count` values from `low` to `high`, spaced evenly in log sigma. */
export function scaleStack(low: number, high: number, count: number): number[] {
  const top = Math.max(low, high);
  const n = Math.max(1, Math.round(count));
  if (n === 1 || top === low) return [low];
  return Array.from({ length: n }, (_, i) => low * (top / low) ** (i / (n - 1)));
}

/** The normalized measure at one scale. */
export function normalizedMeasure(
  input: Plane,
  sigma: number,
  measure: ScaleMeasure,
  gamma: number,
  border: BorderMode,
): Plane {
  const g = gaussianKernel1d(sigma, TRUNCATE);
  const d1 = gaussianFirstDerivative(sigma, TRUNCATE);
  const out = createPlane(input.width, input.height);
  if (measure === "gradient") {
    const lx = correlateSeparable(input, d1, g, border);
    const ly = correlateSeparable(input, g, d1, border);
    const k = sigma ** gamma;
    for (let i = 0; i < out.data.length; i++) {
      out.data[i] = k * Math.hypot(lx.data[i] ?? 0, ly.data[i] ?? 0);
    }
    return out;
  }
  const d2 = gaussianSecondDerivative(sigma, TRUNCATE);
  const lxx = correlateSeparable(input, d2, g, border);
  const lyy = correlateSeparable(input, g, d2, border);
  if (measure === "laplacian") {
    const k = sigma ** (2 * gamma);
    for (let i = 0; i < out.data.length; i++) {
      out.data[i] = k * ((lxx.data[i] ?? 0) + (lyy.data[i] ?? 0));
    }
    return out;
  }
  const lxy = correlateSeparable(input, d1, d1, border);
  const k = sigma ** (4 * gamma);
  for (let i = 0; i < out.data.length; i++) {
    const xy = lxy.data[i] ?? 0;
    out.data[i] = k * ((lxx.data[i] ?? 0) * (lyy.data[i] ?? 0) - xy * xy);
  }
  return out;
}

const stackOf = (params: Params) =>
  scaleStack(
    read.number(params, "sigma", 1),
    read.number(params, "sigmaMax", 4),
    read.number(params, "scales", 5),
  );
const measureOf = (params: Params) => read.string<ScaleMeasure>(params, "measure", "laplacian");
const gammaOf = (params: Params) => read.number(params, "gamma", 1);
const scaleOutput = (params: Params) =>
  read.string<"response" | "scale">(params, "output", "response") === "scale";

const FORMULAS: Record<ScaleMeasure, (gamma: number) => string> = {
  gradient: (g) => `\\sigma^{${g}} \\, |\\nabla L|`,
  laplacian: (g) => `\\sigma^{${2 * g}} \\, (L_{xx} + L_{yy})`,
  hessian: (g) => `\\sigma^{${4 * g}} \\, (L_{xx} L_{yy} - L_{xy}^2)`,
};

const round = (v: number) => Number(v.toFixed(3));

export const scaleSpaceFilter: PlaneFilter = {
  id: "scale-space",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(Math.max(...stackOf(params)), TRUNCATE),
  plane: (input, params, { border }) => {
    const measure = measureOf(params);
    const gamma = gammaOf(params);
    const best = createPlane(input.width, input.height);
    const chosen = createPlane(input.width, input.height);
    stackOf(params).forEach((sigma, index) => {
      const n = normalizedMeasure(input, sigma, measure, gamma, border);
      for (let i = 0; i < n.data.length; i++) {
        const v = n.data[i] ?? 0;
        if (index === 0 || Math.abs(v) > Math.abs(best.data[i] ?? 0)) {
          best.data[i] = v;
          chosen.data[i] = sigma;
        }
      }
    });
    return scaleOutput(params) ? chosen : best;
  },
  representation: (params) => {
    const stack = stackOf(params);
    const gamma = gammaOf(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Stack",
          formula: `\\sigma_i \\in \\{${stack.map(round).join(",\\ ")}\\},\\quad t_i = \\sigma_i^2`,
          note: "Spaced evenly in log sigma. Each L is the image blurred by a Gaussian of variance t, cut at 4 sigma.",
        },
        {
          name: "Normalized measure",
          formula: `N_i = ${FORMULAS[measureOf(params)](gamma)}`,
          note: "Derivatives of order m are multiplied by t^(m gamma / 2), so responses at different scales can be compared.",
        },
        {
          name: "Selection",
          formula: "i^* = \\arg\\max_i |N_i|",
          note: scaleOutput(params)
            ? "The output is the sigma of the strongest scale."
            : "The output is the strongest normalized response, with its sign.",
        },
      ],
    };
  },
};
