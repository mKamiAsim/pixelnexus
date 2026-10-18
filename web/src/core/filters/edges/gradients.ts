/**
 * Gradient pairs: Prewitt, Scharr, Roberts cross and Farid-Simoncelli. Catalog entries in
 * catalog/filters/edges/.
 *
 * Each filter correlates the image with two kernels, one for each direction, and combines the
 * results as the Sobel filter does: one of the two derivatives, the magnitude (L2 or L1) or the
 * direction. The kernels below are the ones that run, and the Inspector shows them.
 *
 * - Prewitt: a difference (-1, 0, 1) across the edge and a plain average (1, 1, 1) along it.
 * - Scharr: the 3, 10, 3 smoothing of OpenCV's Scharr operator, which is closer to rotation
 *   invariant than Sobel.
 * - Roberts cross: the two diagonal differences I(x, y) - I(x + 1, y + 1) and
 *   I(x + 1, y) - I(x, y + 1), as 3x3 kernels with the pixel at the center.
 * - Farid-Simoncelli: the 5-tap derivative and prefilter of Farid and Simoncelli (2004), with the
 *   coefficients of skimage.filters.farid.
 */
import { correlate2d, correlateSeparable, kernelFromRows } from "@/core/filters/convolve";
import type { Plane } from "@/core/filters/planes";
import { read, type KernelInfo, type PlaneFilter } from "@/core/filters/types";

import { sobelCombine, type SobelOutput } from "./sobel";

const outer = (column: readonly number[], row: readonly number[]) =>
  column.map((c) => row.map((r) => c * r));

/** The derivative and prefilter taps of skimage.filters.farid, for correlation. */
export const FARID_DERIVATIVE = [
  -0.109603762960254, -0.276690988455557, 0, 0.276690988455557, 0.109603762960254,
] as const;
export const FARID_PREFILTER = [
  0.0376593171958126, 0.249153396177344, 0.426374573253687, 0.249153396177344, 0.0376593171958126,
] as const;

export interface GradientPair {
  readonly kx: number[][];
  readonly ky: number[][];
  /** Column and row factors of each kernel, when it is separable. */
  readonly separable?: {
    readonly x: { column: readonly number[]; row: readonly number[] };
    readonly y: { column: readonly number[]; row: readonly number[] };
  };
}

export const GRADIENT_PAIRS = {
  prewitt: {
    kx: outer([1, 1, 1], [-1, 0, 1]),
    ky: outer([-1, 0, 1], [1, 1, 1]),
    separable: {
      x: { column: [1, 1, 1], row: [-1, 0, 1] },
      y: { column: [-1, 0, 1], row: [1, 1, 1] },
    },
  },
  scharr: {
    kx: outer([3, 10, 3], [-1, 0, 1]),
    ky: outer([-1, 0, 1], [3, 10, 3]),
    separable: {
      x: { column: [3, 10, 3], row: [-1, 0, 1] },
      y: { column: [-1, 0, 1], row: [3, 10, 3] },
    },
  },
  roberts: {
    kx: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ],
    ky: [
      [0, 0, 0],
      [0, 0, 1],
      [0, -1, 0],
    ],
  },
  farid: {
    kx: outer(FARID_PREFILTER, FARID_DERIVATIVE),
    ky: outer(FARID_DERIVATIVE, FARID_PREFILTER),
    separable: {
      x: { column: FARID_PREFILTER, row: FARID_DERIVATIVE },
      y: { column: FARID_DERIVATIVE, row: FARID_PREFILTER },
    },
  },
} satisfies Record<string, GradientPair>;

export type PairId = keyof typeof GRADIENT_PAIRS;

/** Both derivative planes of a pair. Separable pairs run as two 1D passes. */
export function pairGradients(
  input: Plane,
  pair: GradientPair,
  border: Parameters<typeof correlate2d>[2],
): { gx: Plane; gy: Plane } {
  if (pair.separable) {
    const { x, y } = pair.separable;
    return {
      gx: correlateSeparable(input, x.row, x.column, border),
      gy: correlateSeparable(input, y.row, y.column, border),
    };
  }
  return {
    gx: correlate2d(input, kernelFromRows(pair.kx), border),
    gy: correlate2d(input, kernelFromRows(pair.ky), border),
  };
}

function pairFilter(
  id: PairId,
  names: { x: string; y: string },
  notes: { x: string; y: string },
): PlaneFilter {
  const pair: GradientPair = GRADIENT_PAIRS[id];
  const radius = (pair.kx.length - 1) >> 1;
  return {
    id,
    kind: "derived",
    alphaWeighted: false,
    radius: () => radius,
    plane: (input, params, { border }) => {
      const { gx, gy } = pairGradients(input, pair, border);
      return sobelCombine(
        gx,
        gy,
        read.string<SobelOutput>(params, "output", "magnitude"),
        read.string<"l1" | "l2">(params, "norm", "l2"),
      );
    },
    representation: () => {
      const kernels: KernelInfo[] = [
        {
          name: names.x,
          rows: pair.kx,
          anchor: { x: radius, y: radius },
          normalized: false,
          ...(pair.separable ? { separable: { ...pair.separable.x } } : {}),
          note: notes.x,
        },
        {
          name: names.y,
          rows: pair.ky,
          anchor: { x: radius, y: radius },
          normalized: false,
          ...(pair.separable ? { separable: { ...pair.separable.y } } : {}),
          note: notes.y,
        },
      ];
      return { kind: "kernels", kernels };
    },
  };
}

export const prewittFilter: PlaneFilter = {
  ...pairFilter(
    "prewitt",
    { x: "P_x", y: "P_y" },
    {
      x: "Horizontal change. A difference along x and a plain sum along y.",
      y: "Vertical change. A difference along y and a plain sum along x.",
    },
  ),
  id: "prewitt",
};

export const scharrFilter: PlaneFilter = {
  ...pairFilter(
    "scharr",
    { x: "S_x", y: "S_y" },
    {
      x: "Horizontal change. A difference along x and a 3, 10, 3 average along y.",
      y: "Vertical change. A difference along y and a 3, 10, 3 average along x.",
    },
  ),
  id: "scharr",
};

export const robertsFilter: PlaneFilter = {
  ...pairFilter(
    "roberts",
    { x: "R_1", y: "R_2" },
    {
      x: "Change along the falling diagonal: the pixel minus its neighbor below right.",
      y: "Change along the rising diagonal: the right neighbor minus the neighbor below.",
    },
  ),
  id: "roberts",
};

export const faridFilter: PlaneFilter = {
  ...pairFilter(
    "farid",
    { x: "F_x", y: "F_y" },
    {
      x: "Horizontal change. The 5-tap Farid-Simoncelli derivative along x and its prefilter along y.",
      y: "Vertical change. The 5-tap derivative along y and the prefilter along x.",
    },
  ),
  id: "farid-simoncelli",
};
