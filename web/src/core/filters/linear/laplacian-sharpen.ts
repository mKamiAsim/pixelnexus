/**
 * Laplacian sharpening. Catalog entry: catalog/filters/linear/laplacian-sharpen.yaml.
 *
 * out = I - c * L(I), where L is the discrete Laplacian with a negative center (laplacian.ts).
 * Subtracting the Laplacian raises a pixel that is brighter than its neighbors and lowers one
 * that is darker, so edges get steeper. The filter is one kernel: a unit impulse minus c times
 * the Laplacian kernel. Its weights add up to 1, so flat areas keep their value.
 */
import { correlate2d, kernelFromRows } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { laplacianKernel, type LaplacianNeighbors } from "./laplacian";

/** The sharpening kernel: delta - c * L. */
export function laplacianSharpenKernel(neighbors: LaplacianNeighbors, amount: number): number[][] {
  return laplacianKernel(neighbors, "negative-center").map((row, j) =>
    row.map((v, i) => (i === 1 && j === 1 ? 1 : 0) - amount * v),
  );
}

const neighborsOf = (params: Params) => read.string<LaplacianNeighbors>(params, "neighbors", "4");
const amountOf = (params: Params) => read.number(params, "amount", 1);

export const laplacianSharpenFilter: PlaneFilter = {
  id: "laplacian-sharpen",
  kind: "smooth",
  alphaWeighted: false,
  radius: () => 1,
  plane: (input, params, context) =>
    correlate2d(
      input,
      kernelFromRows(laplacianSharpenKernel(neighborsOf(params), amountOf(params))),
      context.border,
    ),
  representation: (params) => ({
    kind: "kernels",
    kernels: [
      {
        name: "S",
        rows: laplacianSharpenKernel(neighborsOf(params), amountOf(params)),
        anchor: { x: 1, y: 1 },
        normalized: true,
        note: "The weights add up to 1, so flat areas keep their value.",
      },
    ],
  }),
};
