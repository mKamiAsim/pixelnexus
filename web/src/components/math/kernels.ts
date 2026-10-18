import type { KernelInfo } from "@/core/filters/types";

/** Flip a kernel in both directions, to show it in convolution order. */
export function flipKernel(rows: readonly (readonly number[])[]): number[][] {
  return [...rows].reverse().map((row) => [...row].reverse());
}

/** The kernel as a NumPy expression, for copying into Python. */
export function kernelNumpy(kernel: KernelInfo): string {
  const rows = kernel.rows.map(
    (row) => `    [${row.map((v) => Number(v.toPrecision(10))).join(", ")}],`,
  );
  return `${kernel.name.replace(/[^A-Za-z0-9_]/g, "")} = np.array([\n${rows.join("\n")}\n])`;
}
