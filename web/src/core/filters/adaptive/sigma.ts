/**
 * Sigma filter (Lee, 1983). Catalog entry: catalog/filters/adaptive/sigma.yaml.
 *
 * Average only the window values within k sigma of the center value, where sigma is the noise
 * standard deviation. Values across an edge fall outside that range, so they are left out. When
 * fewer than K values are in range, counting the center, the center is taken as a spot of noise
 * and replaced by the mean of its eight neighbors.
 */
import { gatherPlane } from "@/core/filters/nonlinear/window";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const sizeOf = (params: Params) => read.number(params, "size", 5);
const sigmaOf = (params: Params) => read.number(params, "sigma", 10);
const kOf = (params: Params) => read.number(params, "k", 2);
const minOf = (params: Params) => Math.round(read.number(params, "minCount", 3));

/** The sigma rule for one window, given row by row with the center in the middle. */
export function sigmaValue(window: ArrayLike<number>, size: number, range: number, min: number) {
  const center = (size * size - 1) / 2;
  const z = window[center] ?? 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < size * size; i++) {
    const v = window[i] ?? 0;
    if (Math.abs(v - z) <= range) {
      sum += v;
      count++;
    }
  }
  if (count >= min) return sum / count;
  // A spot of noise: the mean of the eight neighbors.
  const c = (size - 1) >> 1;
  let ring = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) ring += window[(c + dy) * size + c + dx] ?? 0;
    }
  }
  return ring / 8;
}

export const sigmaFilter: PlaneFilter = {
  id: "sigma",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, { border }) => {
    const size = sizeOf(params);
    const range = kOf(params) * sigmaOf(params);
    const min = minOf(params);
    return gatherPlane(input, (size - 1) >> 1, border, (w) => sigmaValue(w, size, range, min));
  },
  representation: (params) => ({
    kind: "window",
    size: sizeOf(params),
    count: sizeOf(params) ** 2,
    statistic: `\\operatorname{mean}\\{\\, w \\in W : |w - z| \\le ${kOf(params)} \\cdot ${sigmaOf(params)} \\,\\}`,
    note: `Only values within ${kOf(params) * sigmaOf(params)} of the center z are averaged. With fewer than ${minOf(params)} such values, the center is a spot of noise and gets the mean of its eight neighbors.`,
  }),
};
