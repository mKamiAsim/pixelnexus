/**
 * Weighted median filter (Brownrigg, 1984). Catalog entry:
 * catalog/filters/nonlinear/weighted-median.yaml.
 *
 * Each window value counts as many times as its weight. The output is the smallest value whose
 * running weight, from the smallest value up, reaches half of the total weight. For whole
 * weights with an odd total, that is the median of the list with each value repeated weight
 * times. Values are whole numbers from 0 to 255, counted in a weighted histogram.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";
import { parseKernel } from "@/core/filters/linear/weighted-average";

import { toByte } from "./window";

export const DEFAULT_WEIGHTS = "1 1 1; 1 3 1; 1 1 1";

/** The weights that run. Text that cannot be read, negative weights or a zero total fall back. */
export function medianWeights(text: string): { rows: number[][]; fallback: boolean } {
  const parsed = parseKernel(text);
  const usable =
    parsed.ok &&
    parsed.rows.every((row) => row.every((w) => w >= 0)) &&
    parsed.rows.some((row) => row.some((w) => w > 0));
  if (usable) return { rows: parsed.rows, fallback: false };
  const fallback = parseKernel(DEFAULT_WEIGHTS);
  return { rows: fallback.ok ? fallback.rows : [[1]], fallback: true };
}

export function weightedMedianPlane(
  input: Plane,
  rows: readonly (readonly number[])[],
  border: BorderMode,
): Plane {
  const { width, height, data } = input;
  const ry = rows.length >> 1;
  const rx = (rows[0]?.length ?? 1) >> 1;
  const xs = borderTable(width, rx, border);
  const ys = borderTable(height, ry, border);
  const cells: { i: number; j: number; w: number }[] = [];
  let total = 0;
  rows.forEach((row, j) =>
    row.forEach((w, i) => {
      if (w > 0) cells.push({ i, j, w });
      total += w;
    }),
  );
  const hist = new Float64Array(256);
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      hist.fill(0);
      for (const { i, j, w } of cells) {
        const sx = xs[x + i] ?? -1;
        const sy = ys[y + j] ?? -1;
        const v = sx < 0 || sy < 0 ? 0 : toByte(data[sy * width + sx] ?? 0);
        hist[v] = (hist[v] ?? 0) + w;
      }
      let v = 0;
      let running = hist[0] ?? 0;
      // A small margin keeps weights such as 0.1 from missing half by rounding.
      while (running < total / 2 - 1e-9 && v < 255) running += hist[++v] ?? 0;
      out.data[y * width + x] = v;
    }
  }
  return out;
}

const weightsOf = (params: Params) =>
  medianWeights(read.string(params, "weights", DEFAULT_WEIGHTS));

export const weightedMedianFilter: PlaneFilter = {
  id: "weighted-median",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => {
    const { rows } = weightsOf(params);
    return Math.max(rows.length, rows[0]?.length ?? 0) >> 1;
  },
  plane: (input, params, { border }) => weightedMedianPlane(input, weightsOf(params).rows, border),
  representation: (params) => {
    const { rows, fallback } = weightsOf(params);
    const total = rows.flat().reduce((a, b) => a + b, 0);
    return {
      kind: "window",
      size: Math.max(rows.length, rows[0]?.length ?? 0),
      count: rows.length * (rows[0]?.length ?? 0),
      statistic: "\\operatorname{median}\\,\\{\\, W_k \\text{ repeated } w_k \\text{ times} \\,\\}",
      weights: rows,
      note:
        (fallback
          ? "The weights could not be used, because they need to be numbers of 0 or more with a total above 0. The default weights run. "
          : "") +
        `Each value counts as often as its weight. The total weight is ${Number(total.toFixed(6))}, and the output is the first sorted value whose running weight reaches half of it.`,
    };
  },
};
