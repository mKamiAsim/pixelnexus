/**
 * Dithering. Catalog entry: catalog/filters/artistic/dithering.yaml.
 *
 * Each value is replaced by the nearest of `levels` evenly spaced levels from 0 to 255, and the
 * rounding error is hidden in a pattern:
 *
 * - Floyd-Steinberg: the error goes to the unvisited neighbors, 7/16 to the right, 3/16 below
 *   left, 5/16 below and 1/16 below right, in a row by row scan from the top left.
 * - Atkinson: 1/8 of the error goes to each of six neighbors: one and two to the right, below
 *   left, below, below right, and two below. Only 3/4 of the error is passed on.
 * - Bayer ordered: a threshold from the Bayer matrix, which repeats across the image, shifts each
 *   value by up to half a level step before rounding: v + step ((M + 0.5) / n^2 - 0.5).
 *
 * Error diffusion follows the scan through the whole image, so the filter is global.
 */
import { createPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

type Method = "floyd-steinberg" | "atkinson" | "bayer4" | "bayer8";

/** Error spread as [dx, dy, weight]. */
const DIFFUSION: Record<
  "floyd-steinberg" | "atkinson",
  readonly (readonly [number, number, number])[]
> = {
  "floyd-steinberg": [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
};

/** The n x n Bayer matrix, n a power of 2, from M_2 = [[0, 2], [3, 1]]. */
export function bayerMatrix(n: number): number[][] {
  let m = [
    [0, 2],
    [3, 1],
  ];
  while (m.length < n) {
    const s = m.length;
    m = Array.from({ length: 2 * s }, (_, y) =>
      Array.from({ length: 2 * s }, (_, x) => {
        const base = 4 * (m[y % s]?.[x % s] ?? 0);
        const quadrant = [
          [0, 2],
          [3, 1],
        ][Math.floor(y / s)]?.[Math.floor(x / s)];
        return base + (quadrant ?? 0);
      }),
    );
  }
  return m;
}

const methodOf = (params: Params) => read.string<Method>(params, "method", "floyd-steinberg");
const levelsOf = (params: Params) => Math.max(2, Math.round(read.number(params, "levels", 2)));

export function ditherPlane(input: Plane, method: Method, levels: number): Plane {
  const { width, height } = input;
  const step = 255 / (levels - 1);
  const quantize = (v: number) => Math.min(levels - 1, Math.max(0, Math.round(v / step))) * step;
  const out = createPlane(width, height);
  if (method === "bayer4" || method === "bayer8") {
    const n = method === "bayer4" ? 4 : 8;
    const m = bayerMatrix(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = ((m[y % n]?.[x % n] ?? 0) + 0.5) / (n * n) - 0.5;
        out.data[y * width + x] = quantize((input.data[y * width + x] ?? 0) + step * t);
      }
    }
    return out;
  }
  const work = Float64Array.from(input.data);
  const spread = DIFFUSION[method];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = work[i] ?? 0;
      const level = quantize(old);
      out.data[i] = level;
      const error = old - level;
      for (const [dx, dy, w] of spread) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        work[j] = (work[j] ?? 0) + error * w;
      }
    }
  }
  return out;
}

export const ditheringFilter: PlaneFilter = {
  id: "dithering",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params) => ditherPlane(input, methodOf(params), levelsOf(params)),
  representation: (params) => {
    const method = methodOf(params);
    const levels = levelsOf(params);
    const quantizeStage = {
      name: "Quantize",
      formula: `q(v) = s \\operatorname{round}(v / s),\\quad s = \\frac{255}{${levels} - 1}`,
    };
    if (method === "bayer4" || method === "bayer8") {
      const n = method === "bayer4" ? 4 : 8;
      return {
        kind: "stages",
        stages: [
          {
            name: "Ordered threshold",
            formula: `v' = v + s \\left(\\frac{M_{${n}}(x \\bmod ${n}, y \\bmod ${n}) + 0.5}{${n * n}} - 0.5\\right)`,
            note: "M is the Bayer matrix, which repeats across the image.",
          },
          quantizeStage,
        ],
      };
    }
    return {
      kind: "stages",
      stages: [
        quantizeStage,
        {
          name: "Spread the error",
          formula:
            method === "atkinson"
              ? "e = v - q(v),\\ \\tfrac{1}{8} e \\text{ to } (x{+}1, y), (x{+}2, y), (x{-}1, y{+}1), (x, y{+}1), (x{+}1, y{+}1), (x, y{+}2)"
              : "e = v - q(v),\\ \\tfrac{7}{16} e \\to (x{+}1, y),\\ \\tfrac{3}{16} e \\to (x{-}1, y{+}1),\\ \\tfrac{5}{16} e \\to (x, y{+}1),\\ \\tfrac{1}{16} e \\to (x{+}1, y{+}1)",
          note: "Pixels are visited row by row from the top left. Error past the image edge is dropped.",
        },
      ],
    };
  },
};
