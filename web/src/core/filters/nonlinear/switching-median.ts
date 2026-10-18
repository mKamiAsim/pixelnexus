/**
 * Switching median filter. Catalog entry: catalog/filters/nonlinear/switching-median.yaml.
 *
 * A pixel is taken as an impulse when it differs from the median of its window by more than the
 * threshold T. Only those pixels are replaced by the median. The rest keep their values, so fine
 * detail that is not noise stays (Sun and Neuvo, 1994). With T = 0 it is the plain median filter.
 */
import { createPlane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { rankPlane } from "./window";

const sizeOf = (params: Params) => read.number(params, "size", 3);
const thresholdOf = (params: Params) => read.number(params, "threshold", 40);

/** The switching rule for one pixel. */
export function switchValue(value: number, median: number, threshold: number): number {
  return Math.abs(value - median) > threshold ? median : value;
}

export const switchingMedianFilter: PlaneFilter = {
  id: "switching-median",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, { border }) => {
    const size = sizeOf(params);
    const median = rankPlane(input, (size - 1) >> 1, (size * size + 1) / 2, border);
    const t = thresholdOf(params);
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) {
      out.data[i] = switchValue(input.data[i] ?? 0, median.data[i] ?? 0, t);
    }
    return out;
  },
  representation: (params) => {
    const size = sizeOf(params);
    const count = size * size;
    return {
      kind: "rank",
      size,
      count,
      rank: (count + 1) / 2,
      note: `The median replaces the pixel only when the two differ by more than ${thresholdOf(params)}. Otherwise the pixel keeps its value.`,
    };
  },
};
