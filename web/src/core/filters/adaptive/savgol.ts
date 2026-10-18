/**
 * Savitzky-Golay filter (Savitzky and Golay, 1964). Catalog entry:
 * catalog/filters/adaptive/savgol.yaml.
 *
 * Fitting a polynomial of degree p to the n values of a window by least squares, and taking its
 * value at the center, is a fixed weighted sum of the window. The weights are the first row of
 * the pseudo-inverse (A^T A)^-1 A^T, where A[i][j] = (i - m)^j and m = (n - 1) / 2. They are the
 * same as scipy.signal.savgol_coeffs. The filter runs them along rows, then along columns, which
 * fits a polynomial of degree p in x times degree p in y.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const sizeOf = (params: Params) => read.number(params, "size", 7);
/** The degree is lowered to size - 1 when it is too large for the window. */
const orderOf = (params: Params) =>
  Math.min(sizeOf(params) - 1, Math.max(0, Math.round(read.number(params, "order", 2))));

/** Solve the small system M x = b by Gaussian elimination with partial pivoting. */
function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i] ?? 0]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]?.[col] ?? 0) > Math.abs(a[pivot]?.[col] ?? 0)) pivot = r;
    }
    [a[col], a[pivot]] = [a[pivot] as number[], a[col] as number[]];
    const p = a[col] as number[];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const row = a[r] as number[];
      const f = (row[col] ?? 0) / (p[col] ?? 1);
      for (let c = col; c <= n; c++) row[c] = (row[c] ?? 0) - f * (p[c] ?? 0);
    }
  }
  return a.map((row, i) => (row[n] ?? 0) / (row[i] ?? 1));
}

/** The smoothing weights of a window of `size` values and polynomial degree `order`. */
export function savgolCoefficients(size: number, order: number): number[] {
  const m = (size - 1) / 2;
  const p = Math.min(order, size - 1);
  // Normal equations: (A^T A) c = e_0 gives the first row of the pseudo-inverse, then times A^T.
  const ata = Array.from({ length: p + 1 }, (_, j) =>
    Array.from({ length: p + 1 }, (_, k) => {
      let s = 0;
      for (let i = 0; i < size; i++) s += (i - m) ** (j + k);
      return s;
    }),
  );
  const e0 = Array.from({ length: p + 1 }, (_, j) => (j === 0 ? 1 : 0));
  const row = solve(ata, e0);
  return Array.from({ length: size }, (_, i) => row.reduce((s, r, j) => s + r * (i - m) ** j, 0));
}

export const savgolFilter: PlaneFilter = {
  id: "savgol",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, { border }) => {
    const c = savgolCoefficients(sizeOf(params), orderOf(params));
    return correlateSeparable(input, c, c, border);
  },
  representation: (params) => {
    const size = sizeOf(params);
    const c = savgolCoefficients(size, orderOf(params));
    const r = (size - 1) >> 1;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "S",
          rows: c.map((a) => c.map((b) => a * b)),
          anchor: { x: r, y: r },
          normalized: true,
          separable: { column: c, row: c },
          note: `The weights of a least-squares polynomial of degree ${orderOf(params)} over ${size} values, evaluated at the center. Negative weights keep peaks from flattening.`,
        },
      ],
    };
  },
};
