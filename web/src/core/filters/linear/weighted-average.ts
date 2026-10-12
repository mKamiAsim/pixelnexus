/**
 * Weighted average filter with a kernel you type. Catalog entry:
 * catalog/filters/linear/weighted-average.yaml.
 *
 * The kernel is text: rows separated by semicolons or new lines, numbers by spaces or commas,
 * for example "1 2 1; 2 4 2; 1 2 1". Both sides must be odd, from 1 to 15. With normalize on
 * and a nonzero sum, the weights are divided by their sum, so they add up to 1:
 *
 *   out(x, y) = sum_j sum_i K(i, j) I(x + i, y + j) / s,   s = sum K, or s = 1
 *
 * The anchor is the center cell. The result is signed when weights are negative, so the filter
 * uses the output mapping, with clipping by default.
 */
import { correlate2d, kernelFromRows } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

export const MAX_KERNEL_SIDE = 15;
export const DEFAULT_KERNEL = "1 2 1; 2 4 2; 1 2 1";

export type ParsedKernel =
  | { readonly ok: true; readonly rows: number[][] }
  | { readonly ok: false; readonly message: string };

/** Read kernel text. The message says what is wrong, in plain words. */
export function parseKernel(text: string): ParsedKernel {
  const lines = text
    .split(/[;\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { ok: false, message: "The kernel is empty." };
  const rows: number[][] = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.split(/[\s,]+/).filter((cell) => cell.length > 0);
    const values = cells.map(Number);
    if (values.some((v) => !Number.isFinite(v))) {
      return { ok: false, message: `Row ${index + 1} has a value that is not a number.` };
    }
    rows.push(values);
  }
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) {
    return { ok: false, message: "Every row needs the same number of values." };
  }
  if (width % 2 === 0 || rows.length % 2 === 0) {
    return { ok: false, message: "The kernel needs an odd number of rows and columns." };
  }
  if (width > MAX_KERNEL_SIDE || rows.length > MAX_KERNEL_SIDE) {
    return {
      ok: false,
      message: `The kernel can be at most ${MAX_KERNEL_SIDE} by ${MAX_KERNEL_SIDE}.`,
    };
  }
  return { ok: true, rows };
}

/** The kernel that runs: the parsed kernel, divided by its sum when asked and possible. */
export function weightedKernel(text: string, normalize: boolean): number[][] {
  const parsed = parseKernel(text);
  const rows = parsed.ok ? parsed.rows : (parseKernel(DEFAULT_KERNEL) as { rows: number[][] }).rows;
  let sum = 0;
  for (const row of rows) for (const v of row) sum += v;
  return normalize && sum !== 0 ? rows.map((row) => row.map((v) => v / sum)) : rows;
}

const kernelOf = (params: Params) => read.string(params, "kernel", DEFAULT_KERNEL);
const normalizeOf = (params: Params) => read.boolean(params, "normalize", true);

export const weightedAverageFilter: PlaneFilter = {
  id: "weighted-average",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => {
    const rows = weightedKernel(kernelOf(params), false);
    return Math.max(rows.length, rows[0]?.length ?? 0) >> 1;
  },
  plane: (input, params, context) =>
    correlate2d(
      input,
      kernelFromRows(weightedKernel(kernelOf(params), normalizeOf(params))),
      context.border,
    ),
  representation: (params) => {
    const rows = weightedKernel(kernelOf(params), normalizeOf(params));
    let sum = 0;
    for (const row of rows) for (const v of row) sum += v;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "K",
          rows,
          anchor: { x: (rows[0]?.length ?? 1) >> 1, y: rows.length >> 1 },
          normalized: Math.abs(sum - 1) < 1e-9,
          note: parseKernel(kernelOf(params)).ok
            ? `The weights add up to ${Number(sum.toFixed(6))}.`
            : "The kernel text could not be read, so the default kernel runs.",
        },
      ],
    };
  },
};
