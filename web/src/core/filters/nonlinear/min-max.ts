/**
 * Min, max and midpoint filters. Catalog entries: catalog/filters/nonlinear/min.yaml, max.yaml
 * and midpoint.yaml.
 *
 * The min filter is gray erosion with a flat square, and the max filter is gray dilation. Both
 * run as a row pass and a column pass in extremePlane, which morphology shares. The midpoint
 * is the mean of the two. Values keep their fractions, so brightness planes are not rounded.
 */
import { createPlane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter, type Representation } from "@/core/filters/types";

import { extremePlane } from "./window";

const sizeOf = (params: Params) => read.number(params, "size", 3);
const radiusOf = (params: Params) => (sizeOf(params) - 1) >> 1;

/** The rank of the chosen value: 1 for the min, the window count for the max. */
export function extremeRank(size: number, kind: "min" | "max"): Representation {
  const count = size * size;
  return { kind: "rank", size, count, rank: kind === "min" ? 1 : count };
}

export const minFilter: PlaneFilter = {
  id: "min",
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, context) => extremePlane(input, radiusOf(params), context.border, "min"),
  representation: (params) => extremeRank(sizeOf(params), "min"),
};

export const maxFilter: PlaneFilter = {
  id: "max",
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, context) => extremePlane(input, radiusOf(params), context.border, "max"),
  representation: (params) => extremeRank(sizeOf(params), "max"),
};

export const midpointFilter: PlaneFilter = {
  id: "midpoint",
  kind: "smooth",
  alphaWeighted: false,
  radius: radiusOf,
  plane: (input, params, context) => {
    const low = extremePlane(input, radiusOf(params), context.border, "min");
    const high = extremePlane(input, radiusOf(params), context.border, "max");
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) {
      out.data[i] = ((low.data[i] ?? 0) + (high.data[i] ?? 0)) / 2;
    }
    return out;
  },
  representation: (params) => {
    const size = sizeOf(params);
    return {
      kind: "window",
      size,
      count: size * size,
      statistic: "\\tfrac{1}{2}\\left(\\min W + \\max W\\right)",
      note: "The output is halfway between the smallest and the largest value of the window W.",
    };
  },
};
