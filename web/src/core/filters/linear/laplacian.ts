/**
 * Discrete Laplacian. Catalog entry: catalog/filters/linear/laplacian.yaml.
 *
 * Two neighbor variants and two sign conventions. With the negative center, the kernel
 * approximates the Laplacian d2I/dx2 + d2I/dy2, as scipy.ndimage.laplace and OpenCV do. The
 * positive center is the same kernel times -1, which some sharpening texts use.
 */
import { correlate2d, kernelFromRows } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

export type LaplacianNeighbors = "4" | "8";
export type LaplacianSign = "negative-center" | "positive-center";

/** The selected kernel as rows of whole numbers. */
export function laplacianKernel(neighbors: LaplacianNeighbors, sign: LaplacianSign): number[][] {
  const base =
    neighbors === "8"
      ? [
          [1, 1, 1],
          [1, -8, 1],
          [1, 1, 1],
        ]
      : [
          [0, 1, 0],
          [1, -4, 1],
          [0, 1, 0],
        ];
  // "0 - v" instead of "-v" avoids -0 in the positive-center kernel.
  return sign === "positive-center" ? base.map((row) => row.map((v) => 0 - v)) : base;
}

const neighborsOf = (params: Params) => read.string<LaplacianNeighbors>(params, "neighbors", "4");
const signOf = (params: Params) => read.string<LaplacianSign>(params, "sign", "negative-center");

export const laplacianFilter: PlaneFilter = {
  id: "laplacian",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 1,
  plane: (input, params, context) =>
    correlate2d(
      input,
      kernelFromRows(laplacianKernel(neighborsOf(params), signOf(params))),
      context.border,
    ),
  representation: (params) => ({
    kind: "kernels",
    kernels: [
      {
        name: "L",
        rows: laplacianKernel(neighborsOf(params), signOf(params)),
        anchor: { x: 1, y: 1 },
        normalized: false,
        note: "The weights add up to 0, so flat areas give 0.",
      },
    ],
  }),
};
