/**
 * Local-statistics noise filters. Catalog entries: catalog/filters/adaptive/wiener-adaptive.yaml
 * and adaptive-local-noise.yaml.
 *
 * Both use the local mean m and local variance s^2 of a window and a known noise variance n^2:
 *
 *   out = m + max(0, s^2 - n^2) / max(s^2, n^2) * (z - m)
 *
 * Where the window varies much more than the noise, the pixel is kept. Where it varies about as
 * much as the noise, the pixel moves to the local mean. This is the additive-noise filter of Lee
 * (1980), the form of MATLAB's wiener2 and scipy.signal.wiener, and the adaptive local noise
 * reduction filter of Gonzalez and Woods, which writes it as z - (n^2 / s^2)(z - m) with the
 * ratio limited to 1.
 *
 * MATLAB and SciPy estimate n^2 as the mean local variance of the whole image when it is not
 * given. Here it is a parameter, so a strip of the image gives the same result as the whole.
 */
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { localMoments } from "./local-stats";

const sizeOf = (params: Params) => read.number(params, "size", 5);
const noiseOf = (params: Params) => read.number(params, "noise", 10);

export function localNoisePlane(
  input: Plane,
  radius: number,
  noiseVariance: number,
  border: BorderMode,
): Plane {
  const { mean, variance } = localMoments(input, radius, border);
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < out.data.length; i++) {
    const m = mean[i] ?? 0;
    const s2 = variance[i] ?? 0;
    const denominator = Math.max(s2, noiseVariance);
    const gain = denominator > 0 ? Math.max(0, s2 - noiseVariance) / denominator : 0;
    out.data[i] = m + gain * ((input.data[i] ?? 0) - m);
  }
  return out;
}

const shared = (statistic: string): Omit<PlaneFilter, "id"> => ({
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, { border }) =>
    localNoisePlane(input, (sizeOf(params) - 1) >> 1, noiseOf(params) ** 2, border),
  representation: (params) => ({
    kind: "window",
    size: sizeOf(params),
    count: sizeOf(params) ** 2,
    statistic: statistic.replace(/NOISE/g, `${noiseOf(params)}^2`),
    note: "m and s^2 are the mean and variance of the window. Where s^2 is near the noise variance, the output is near m. Where s^2 is much larger, the pixel is kept.",
  }),
});

export const wienerAdaptiveFilter: PlaneFilter = {
  id: "wiener-adaptive",
  ...shared("m + \\frac{\\max(0,\\, s^2 - NOISE)}{\\max(s^2,\\, NOISE)}\\,(z - m)"),
};

export const adaptiveLocalNoiseFilter: PlaneFilter = {
  id: "adaptive-local-noise",
  ...shared("z - \\min\\Bigl(1, \\frac{NOISE}{s^2}\\Bigr)(z - m)"),
};
