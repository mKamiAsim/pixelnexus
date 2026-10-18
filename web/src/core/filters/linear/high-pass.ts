/**
 * High-pass and high-boost filters. Catalog entries: catalog/filters/linear/high-pass.yaml and
 * high-boost.yaml.
 *
 * Both subtract a Gaussian low-pass result G * I from the image:
 *
 *   high-pass:  out = I - G * I                (signed, shown with an output mapping)
 *   high-boost: out = A * I - G * I,  A >= 1   (clipped like any image)
 *
 * With A = 1 the high-boost equals the high-pass. With A = 2 it equals the unsharp mask with
 * amount 1: I + (I - G * I). Each filter is one kernel: A times a unit impulse minus G.
 */
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { gaussianKernel2d, gaussianPlane, gaussianRadius } from "./gaussian";

const TRUNCATE = 3;
const sigmaOf = (params: Params) => read.number(params, "sigma", 2);
const boostOf = (params: Params) => read.number(params, "boost", 2);

/** A * I - G * I for one plane. */
export function boostPlane(input: Plane, sigma: number, boost: number, border: BorderMode): Plane {
  const blurred = gaussianPlane(input, sigma, TRUNCATE, border);
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = boost * (input.data[i] ?? 0) - (blurred.data[i] ?? 0);
  }
  return out;
}

/** The kernel A * delta - G. */
export function boostKernel(sigma: number, boost: number): number[][] {
  const g = gaussianKernel2d(sigma, TRUNCATE);
  const r = (g.length - 1) / 2;
  return g.map((row, j) => row.map((w, i) => (i === r && j === r ? boost : 0) - w));
}

export const highPassFilter: PlaneFilter = {
  id: "high-pass",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(sigmaOf(params), TRUNCATE),
  plane: (input, params, context) => boostPlane(input, sigmaOf(params), 1, context.border),
  representation: (params) => {
    const rows = boostKernel(sigmaOf(params), 1);
    const r = (rows.length - 1) / 2;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "H",
          rows,
          anchor: { x: r, y: r },
          normalized: false,
          note: "The weights add up to 0, so flat areas give 0. The output mapping shows the signed result.",
        },
      ],
    };
  },
};

export const highBoostFilter: PlaneFilter = {
  id: "high-boost",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(sigmaOf(params), TRUNCATE),
  plane: (input, params, context) =>
    boostPlane(input, sigmaOf(params), boostOf(params), context.border),
  representation: (params) => {
    const boost = boostOf(params);
    const rows = boostKernel(sigmaOf(params), boost);
    const r = (rows.length - 1) / 2;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "K",
          rows,
          anchor: { x: r, y: r },
          normalized: false,
          note: `The weights add up to A - 1 = ${Number((boost - 1).toFixed(3))}. A flat area of value v becomes (A - 1) v.`,
        },
      ],
    };
  },
};
