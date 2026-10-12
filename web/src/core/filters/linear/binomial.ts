/**
 * Binomial filter. Catalog entry: catalog/filters/linear/binomial.yaml.
 *
 * The 1D weights of size n are row n - 1 of Pascal's triangle divided by 2^(n - 1):
 * b_k = C(n - 1, k) / 2^(n - 1). The 2D kernel is the outer product of the 1D kernel with itself,
 * so the filter runs as two 1D passes. As n grows, the weights approach a Gaussian with
 * variance (n - 1) / 4, by the central limit theorem.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** Row n - 1 of Pascal's triangle, as whole numbers. */
export function pascalRow(size: number): number[] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer.");
  let row = [1];
  for (let k = 1; k < size; k++) row = [...row, 0].map((v, i) => v + (row[i - 1] ?? 0));
  return row;
}

/** Normalized 1D weights b_k, adding up to 1. */
export function binomialWeights(size: number): Float64Array {
  const row = pascalRow(size);
  const total = 2 ** (size - 1);
  return Float64Array.from(row, (v) => v / total);
}

const sizeOf = (params: Params) => read.number(params, "size", 5);

export const binomialFilter: PlaneFilter = {
  id: "binomial",
  kind: "smooth",
  alphaWeighted: true,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, context) => {
    const w = binomialWeights(sizeOf(params));
    return correlateSeparable(input, w, w, context.border);
  },
  representation: (params) => {
    const size = sizeOf(params);
    const row = pascalRow(size);
    const divisor = 4 ** (size - 1);
    const w = Array.from(binomialWeights(size));
    const r = (size - 1) >> 1;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "B",
          rows: row.map((a) => row.map((b) => (a * b) / divisor)),
          anchor: { x: r, y: r },
          normalized: true,
          divisor,
          separable: { column: w, row: w },
          note: "Each 1D weight is a binomial coefficient divided by 2^(n-1).",
        },
      ],
    };
  },
};
