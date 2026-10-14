/**
 * Emboss, outline and edge enhance. Catalog entries: catalog/filters/artistic/{emboss,outline,
 * edge-enhance}.yaml.
 *
 * Fixed 3 x 3 kernels from Pillow's ImageFilter, written here as the correlation that Pillow
 * really applies. Pillow applies the first row of a kernel to the row below the pixel, so its
 * EMBOSS, listed with -1 at the top left, subtracts the pixel below and to the left. A single
 * bright pixel and a random image both show this. The other kernels are symmetric.
 *
 * - EMBOSS: 1 at the pixel and -1 below and to the left of it, plus an offset of 128.
 * - CONTOUR (outline): 8 in the center and -1 around it, plus an offset of 255.
 * - EDGE_ENHANCE: 10 in the center and -1 around it, divided by 2. EDGE_ENHANCE_MORE: 9 and -1.
 *
 * Pillow leaves the outermost pixels unchanged. Here the Border mode fills the window instead.
 */
import { correlate2d, kernelFromRows } from "@/core/filters/convolve";
import type { BorderMode, Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

export const EMBOSS_ROWS = [
  [0, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
];
export const CONTOUR_ROWS = [
  [-1, -1, -1],
  [-1, 8, -1],
  [-1, -1, -1],
];

export function edgeEnhanceRows(strength: "normal" | "more"): number[][] {
  const [center, scale] = strength === "more" ? [9, 1] : [10, 2];
  return [
    [-1, -1, -1],
    [-1, center, -1],
    [-1, -1, -1],
  ].map((row) => row.map((v) => (v === -1 ? -1 / scale : center / scale)));
}

function withOffset(plane: Plane, offset: number): Plane {
  for (let i = 0; i < plane.data.length; i++) plane.data[i] = (plane.data[i] ?? 0) + offset;
  return plane;
}

function fixedKernel(rows: number[][], offset: number, note: string) {
  return {
    kind: "derived" as const,
    alphaWeighted: false,
    radius: () => 1,
    plane: (input: Plane, _params: Params, context: { border: BorderMode }) =>
      withOffset(correlate2d(input, kernelFromRows(rows), context.border), offset),
    representation: () => ({
      kind: "kernels" as const,
      kernels: [{ name: "K", rows, anchor: { x: 1, y: 1 }, normalized: false, note }],
    }),
  };
}

export const embossFilter: PlaneFilter = {
  id: "emboss",
  ...fixedKernel(EMBOSS_ROWS, 128, "Plus 128, so flat areas turn mid gray. Pillow's EMBOSS."),
};

export const outlineFilter: PlaneFilter = {
  id: "outline",
  ...fixedKernel(CONTOUR_ROWS, 255, "Plus 255, so flat areas turn white. Pillow's CONTOUR."),
};

const strengthOf = (params: Params) => read.string<"normal" | "more">(params, "strength", "normal");

export const edgeEnhanceFilter: PlaneFilter = {
  id: "edge-enhance",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 1,
  plane: (input, params, { border }) =>
    correlate2d(input, kernelFromRows(edgeEnhanceRows(strengthOf(params))), border),
  representation: (params) => ({
    kind: "kernels",
    kernels: [
      {
        name: "K",
        rows: edgeEnhanceRows(strengthOf(params)),
        anchor: { x: 1, y: 1 },
        normalized: true,
        note:
          strengthOf(params) === "more"
            ? "Pillow's EDGE_ENHANCE_MORE. The weights add up to 1."
            : "Pillow's EDGE_ENHANCE: 10 and -1, divided by 2. The weights add up to 1.",
      },
    ],
  }),
};
