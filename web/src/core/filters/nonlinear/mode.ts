/**
 * Mode filter. Catalog entry: catalog/filters/nonlinear/mode.yaml.
 *
 * Each pixel becomes the value that occurs most often in its window. When several values tie,
 * the smallest of them wins, as in skimage.filters.rank.modal. Values are whole numbers from
 * 0 to 255, counted in a sliding histogram.
 */
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { histogramPlane } from "./window";

const sizeOf = (params: Params) => read.number(params, "size", 3);

/** The most frequent value of a histogram, the smallest one on ties. */
export function histogramMode(hist: ArrayLike<number>): number {
  let best = 0;
  for (let v = 1; v < 256; v++) if ((hist[v] ?? 0) > (hist[best] ?? 0)) best = v;
  return best;
}

export const modeFilter: PlaneFilter = {
  id: "mode",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, { border }) =>
    histogramPlane(input, (sizeOf(params) - 1) >> 1, border, (hist) => histogramMode(hist)),
  representation: (params) => ({
    kind: "window",
    size: sizeOf(params),
    count: sizeOf(params) ** 2,
    statistic: "\\operatorname{mode} W",
    note: "The value that occurs most often in the window W. On a tie the smallest of the tied values wins.",
  }),
};
