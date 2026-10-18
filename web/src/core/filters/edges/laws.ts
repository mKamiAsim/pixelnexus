/**
 * Laws' texture energy filters (Laws, 1980). Catalog entry: catalog/filters/features/laws.yaml.
 *
 * Five 5-tap vectors measure level, edge, spot, wave and ripple. A mask is the outer product of
 * a vertical and a horizontal vector, for example E5 down the column and L5 along the row. The
 * filter removes the local mean first, applies the mask, and averages the absolute response over
 * a window. That average is the texture energy.
 */
import { boxMean, correlateSeparable } from "@/core/filters/convolve";
import { createPlane, cropPlane, padPlane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

export const LAWS_VECTORS = {
  L5: [1, 4, 6, 4, 1],
  E5: [-1, -2, 0, 2, 1],
  S5: [-1, 0, 2, 0, -1],
  W5: [-1, 2, 0, -2, 1],
  R5: [1, -4, 6, -4, 1],
} as const;

export type LawsVector = keyof typeof LAWS_VECTORS;

const verticalOf = (params: Params) => read.string<LawsVector>(params, "vertical", "E5");
const horizontalOf = (params: Params) => read.string<LawsVector>(params, "horizontal", "L5");
const windowOf = (params: Params) => read.number(params, "window", 15);
const removeMeanOf = (params: Params) => read.boolean(params, "removeMean", true);

export const lawsFilter: PlaneFilter = {
  id: "laws",
  kind: "derived",
  alphaWeighted: false,
  // Half a window for the mean removal, 2 for the 5x5 mask and half a window for the energy.
  radius: (params) => windowOf(params) - 1 + 2,
  plane: (input, params, { border }) => {
    // Extend once by the full support, so a strip, the whole image and a direct call agree.
    // Each stage then reads the extended values, which matters for the odd masks such as E5.
    const size = windowOf(params);
    const reach = size - 1 + 2;
    const padded = padPlane(input, reach, border);
    let base = padded;
    if (removeMeanOf(params)) {
      const mean = boxMean(padded, size, "replicate");
      base = createPlane(padded.width, padded.height);
      for (let i = 0; i < base.data.length; i++) {
        base.data[i] = (padded.data[i] ?? 0) - (mean.data[i] ?? 0);
      }
    }
    const v = LAWS_VECTORS[verticalOf(params)];
    const h = LAWS_VECTORS[horizontalOf(params)];
    const response = correlateSeparable(base, h, v, "replicate");
    for (let i = 0; i < response.data.length; i++) {
      response.data[i] = Math.abs(response.data[i] ?? 0);
    }
    return cropPlane(boxMean(response, size, "replicate"), reach);
  },
  representation: (params) => {
    const v = LAWS_VECTORS[verticalOf(params)];
    const h = LAWS_VECTORS[horizontalOf(params)];
    return {
      kind: "kernels",
      kernels: [
        {
          name: `${verticalOf(params)}^{\\mathsf T} ${horizontalOf(params)}`,
          rows: v.map((a) => h.map((b) => a * b)),
          anchor: { x: 2, y: 2 },
          normalized: false,
          separable: { column: [...v], row: [...h] },
          note: `The texture energy is the mean of the absolute response over a ${windowOf(params)}x${windowOf(params)} window${removeMeanOf(params) ? ", after the local mean of that size is removed" : ""}.`,
        },
      ],
    };
  },
};
