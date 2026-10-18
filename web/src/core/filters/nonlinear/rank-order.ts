/**
 * Rank-order (percentile) filter. Catalog entry: catalog/filters/nonlinear/rank-order.yaml.
 *
 * Sorts each size x size window and keeps the value at one rank. Rank 1 is the min, the middle
 * rank is the median and the last rank is the max. A percentile p picks the 0-based rank
 * floor(n p / 100), and p = 100 picks the last one, the same rule as scipy.ndimage.percentile_filter.
 * Values are whole numbers from 0 to 255, from a sliding histogram.
 */
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { rankPlane } from "./window";

const sizeOf = (params: Params) => read.number(params, "size", 3);

/** The 1-based rank that runs, from either the rank or the percentile parameter. */
export function chosenRank(params: Params): { size: number; count: number; rank: number } {
  const size = sizeOf(params);
  const count = size * size;
  if (read.string<"rank" | "percentile">(params, "by", "rank") === "percentile") {
    const p = Math.min(100, Math.max(0, read.number(params, "percentile", 50)));
    return { size, count, rank: p === 100 ? count : Math.floor((count * p) / 100) + 1 };
  }
  const rank = Math.round(read.number(params, "rank", (count + 1) / 2));
  return { size, count, rank: Math.min(count, Math.max(1, rank)) };
}

export const rankOrderFilter: PlaneFilter = {
  id: "rank-order",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, context) => {
    const { size, rank } = chosenRank(params);
    return rankPlane(input, (size - 1) >> 1, rank, context.border);
  },
  representation: (params) => {
    const { size, count, rank } = chosenRank(params);
    const asked = Math.round(read.number(params, "rank", rank));
    const clamped =
      read.string<"rank" | "percentile">(params, "by", "rank") === "rank" && asked !== rank;
    return {
      kind: "rank",
      size,
      count,
      rank,
      ...(clamped
        ? { note: `The window has ${count} values, so rank ${asked} became ${rank}.` }
        : {}),
    };
  },
};
