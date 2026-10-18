/**
 * Triangular (tent) filter. Catalog entry: catalog/filters/linear/triangular.yaml.
 *
 * The 1D weights for radius r are w_i = (r + 1 - |i|) / (r + 1)^2 for i from -r to r. They add
 * up to 1. The triangle is a box of width r + 1 convolved with itself, so the tent blurs like
 * two box filters in a row. The 2D kernel is the outer product of the 1D kernel with itself.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** Whole-number weights r + 1 - |i|, and their sum (r + 1)^2. */
export function tentRow(size: number): { row: number[]; total: number } {
  if (!Number.isInteger(size) || size < 1 || size % 2 === 0) {
    throw new RangeError("size must be a positive odd integer.");
  }
  const r = (size - 1) / 2;
  const row = Array.from({ length: size }, (_, k) => r + 1 - Math.abs(k - r));
  return { row, total: (r + 1) ** 2 };
}

export function tentWeights(size: number): Float64Array {
  const { row, total } = tentRow(size);
  return Float64Array.from(row, (v) => v / total);
}

const sizeOf = (params: Params) => read.number(params, "size", 5);

export const triangularFilter: PlaneFilter = {
  id: "triangular",
  kind: "smooth",
  alphaWeighted: true,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, context) => {
    const w = tentWeights(sizeOf(params));
    return correlateSeparable(input, w, w, context.border);
  },
  representation: (params) => {
    const size = sizeOf(params);
    const { row, total } = tentRow(size);
    const divisor = total * total;
    const w = Array.from(tentWeights(size));
    const r = (size - 1) >> 1;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "T",
          rows: row.map((a) => row.map((b) => (a * b) / divisor)),
          anchor: { x: r, y: r },
          normalized: true,
          divisor,
          separable: { column: w, row: w },
          note: "The 1D weights rise in equal steps to the center and fall again.",
        },
      ],
    };
  },
};
