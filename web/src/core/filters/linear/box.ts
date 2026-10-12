/**
 * Box filter (mean filter). Catalog entry: catalog/filters/linear/box.yaml.
 *
 * Each output value is the mean of a size x size window. Running sums make the cost per pixel
 * independent of the window size.
 */
import { boxMean } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const sizeOf = (params: Params) => read.number(params, "size", 3);

/** The kernel as whole numbers and a divisor: every weight is 1 / size^2. */
export function boxKernel(size: number): { rows: number[][]; divisor: number } {
  return {
    rows: Array.from({ length: size }, () => Array.from({ length: size }, () => 1)),
    divisor: size * size,
  };
}

export const boxFilter: PlaneFilter = {
  id: "box",
  kind: "smooth",
  alphaWeighted: true,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, context) => boxMean(input, sizeOf(params), context.border),
  representation: (params) => {
    const size = sizeOf(params);
    const { rows, divisor } = boxKernel(size);
    const r = (size - 1) >> 1;
    const ones = Array.from({ length: size }, () => 1 / size);
    return {
      kind: "kernels",
      kernels: [
        {
          name: "B",
          rows: rows.map((row) => row.map((v) => v / divisor)),
          anchor: { x: r, y: r },
          normalized: true,
          divisor,
          separable: { column: ones, row: ones },
        },
      ],
    };
  },
};
