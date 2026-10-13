/**
 * Guided filter (He, Sun and Tang, 2013). Catalog entry: catalog/filters/nonlinear/guided.yaml.
 *
 * In each window the output is a linear function of the guide I: q = a I + b. The coefficients
 * that fit the input p best, with a penalty eps a^2, are
 *
 *   a = cov(I, p) / (var(I) + eps),   b = mean(p) - a mean(I)
 *
 * Every pixel lies in many windows, so the output averages their coefficients:
 * q = mean(a) I + mean(b). All means are box means of side 2r + 1, so the cost does not depend on
 * the radius. eps is given for values from 0 to 1, as in the paper, and scaled by 255^2 here.
 *
 * The plane is extended once by 2r pixels with the border mode, the filter runs on the extended
 * plane, and the frame is cut off. For the reflect modes and wrap this equals applying the
 * border rule to every box mean. OpenCV's ximgproc.guidedFilter uses the reflect mode.
 */
import {
  createPlane,
  cropPlane,
  padPlane,
  type BorderMode,
  type Plane,
} from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { windowSum } from "./window";

const radiusOf = (params: Params) => read.number(params, "radius", 4);
const epsOf = (params: Params) => read.number(params, "eps", 0.01);

/** Box mean in float64 with the border rule. */
function mean(values: Float64Array, width: number, height: number, r: number, border: BorderMode) {
  const sums = windowSum(values, width, height, r, border);
  const n = (2 * r + 1) ** 2;
  for (let i = 0; i < sums.length; i++) sums[i] = (sums[i] ?? 0) / n;
  return sums;
}

/** The guided filter of p with guide I. eps is in 8-bit units squared. */
export function guidedPlane(
  p: Plane,
  guide: Plane,
  r: number,
  eps: number,
  border: BorderMode,
): Plane {
  const { width, height } = p;
  const I = Float64Array.from(guide.data);
  const P = Float64Array.from(p.data);
  const product = (a: Float64Array, b: Float64Array) => a.map((v, i) => v * (b[i] ?? 0));
  const meanI = mean(I, width, height, r, border);
  const meanP = mean(P, width, height, r, border);
  const corrI = mean(product(I, I), width, height, r, border);
  const corrIP = mean(product(I, P), width, height, r, border);
  const a = new Float64Array(width * height);
  const b = new Float64Array(width * height);
  for (let i = 0; i < a.length; i++) {
    const mI = meanI[i] ?? 0;
    const mP = meanP[i] ?? 0;
    const variance = (corrI[i] ?? 0) - mI * mI;
    const covariance = (corrIP[i] ?? 0) - mI * mP;
    a[i] = covariance / (variance + eps);
    b[i] = mP - (a[i] ?? 0) * mI;
  }
  const meanA = mean(a, width, height, r, border);
  const meanB = mean(b, width, height, r, border);
  const out = createPlane(width, height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = (meanA[i] ?? 0) * (I[i] ?? 0) + (meanB[i] ?? 0);
  }
  return out;
}

export const guidedFilter: PlaneFilter = {
  id: "guided",
  kind: "smooth",
  alphaWeighted: false,
  // The coefficients a and b are averaged once more, so the output needs 2r pixels around it.
  radius: (params) => 2 * radiusOf(params),
  plane: (input, params, { border }) => {
    // Extend once by the full support, so a strip and a whole-image run see the same values.
    const r = radiusOf(params);
    const padded = padPlane(input, 2 * r, border);
    return cropPlane(guidedPlane(padded, padded, r, epsOf(params) * 255 * 255, "replicate"), 2 * r);
  },
  representation: (params) => {
    const r = radiusOf(params);
    return {
      kind: "window",
      size: 2 * r + 1,
      count: (2 * r + 1) ** 2,
      statistic: `\\bar{a}_i I_i + \\bar{b}_i,\\quad a_k = \\frac{\\operatorname{cov}_k(I, p)}{\\sigma_k^2 + ${epsOf(params)}}`,
      note: "In every window k the output is a straight-line function of the guide. Flat windows get a near 0 and follow the window mean. Windows on an edge get a near 1 and keep the edge. Here the guide is the input itself.",
    };
  },
};
