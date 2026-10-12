/**
 * Unsharp mask. Catalog entry: catalog/filters/linear/unsharp-mask.yaml.
 *
 * out = I + amount * (I - G * I), where G * I is a Gaussian blur of I. Where the detail
 * |I - G * I| is smaller than the threshold, the pixel keeps its value. With threshold 0 the
 * filter is linear, and its kernel is (1 + amount) times a unit impulse minus amount times G.
 */
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { gaussianKernel2d, gaussianPlane, gaussianRadius } from "./gaussian";

const sigmaOf = (params: Params) => read.number(params, "sigma", 2);
const amountOf = (params: Params) => read.number(params, "amount", 1);
const thresholdOf = (params: Params) => read.number(params, "threshold", 0);
const TRUNCATE = 3;

export function unsharpPlane(
  input: Plane,
  sigma: number,
  amount: number,
  threshold: number,
  border: BorderMode,
): Plane {
  const blurred = gaussianPlane(input, sigma, TRUNCATE, border);
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < out.data.length; i++) {
    const value = input.data[i] ?? 0;
    const detail = value - (blurred.data[i] ?? 0);
    out.data[i] = Math.abs(detail) < threshold ? value : value + amount * detail;
  }
  return out;
}

/** The single kernel that equals the filter when the threshold is 0. */
export function unsharpKernel(sigma: number, amount: number): number[][] {
  const g = gaussianKernel2d(sigma, TRUNCATE);
  const r = (g.length - 1) / 2;
  return g.map((row, j) => row.map((w, i) => (i === r && j === r ? 1 + amount : 0) - amount * w));
}

export const unsharpMaskFilter: PlaneFilter = {
  id: "unsharp-mask",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(sigmaOf(params), TRUNCATE),
  plane: (input, params, context) =>
    unsharpPlane(input, sigmaOf(params), amountOf(params), thresholdOf(params), context.border),
  representation: (params) => {
    const rows = unsharpKernel(sigmaOf(params), amountOf(params));
    const r = (rows.length - 1) / 2;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "U",
          rows,
          anchor: { x: r, y: r },
          normalized: true,
          note:
            thresholdOf(params) > 0
              ? "This kernel equals the filter only where the detail reaches the threshold. Elsewhere the pixel keeps its value."
              : "The filter equals correlation with this kernel. The weights add up to 1.",
        },
      ],
    };
  },
};
