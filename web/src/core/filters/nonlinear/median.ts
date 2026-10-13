/**
 * Median filter. Catalog entry: catalog/filters/nonlinear/median.yaml.
 *
 * The median of each size x size window comes from a 256-bin histogram that slides along the
 * row (Huang, Yang and Tang, 1979). Each step removes one column of the window and adds one,
 * so the cost per pixel grows with the window width, not its area.
 *
 * Values are whole numbers from 0 to 255. Brightness planes are rounded to whole values first.
 */
import type { BorderMode, Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { rankPlane } from "./window";

const sizeOf = (params: Params) => read.number(params, "size", 3);

/** The window as the Rank stepper and the Inspector show it. */
export function medianWindow(size: number): { size: number; count: number; rank: number } {
  const count = size * size;
  return { size, count, rank: (count + 1) / 2 };
}

export function medianPlane(input: Plane, size: number, border: BorderMode): Plane {
  return rankPlane(input, (size - 1) >> 1, medianWindow(size).rank, border);
}

export const medianFilter: PlaneFilter = {
  id: "median",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, context) => medianPlane(input, sizeOf(params), context.border),
  representation: (params) => {
    const { size, count, rank } = medianWindow(sizeOf(params));
    return { kind: "rank", size, count, rank };
  },
};
