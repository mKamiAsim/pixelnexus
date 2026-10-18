/**
 * Disk averaging filter, the uniform disk point spread function of a defocused lens.
 * Catalog entry: catalog/filters/linear/disk-average.yaml.
 *
 * The weight of kernel cell (i, j) is the area of the disk of radius R inside the cell
 * [i - 1/2, i + 1/2] x [j - 1/2, j + 1/2], divided by the total, which is pi R^2. The area is
 * exact: along x, the disk covers the height between -h(x) and h(x), h(x) = sqrt(R^2 - x^2),
 * and the integral of h has the closed form G(x) = (x h(x) + R^2 asin(x / R)) / 2.
 */
import { correlate2d, kernelFromRows } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** The area of the disk of radius R at the origin inside the box [x0, x1] x [y0, y1]. */
export function diskBoxArea(R: number, x0: number, x1: number, y0: number, y1: number): number {
  const a = Math.max(x0, -R);
  const b = Math.min(x1, R);
  if (b <= a || y1 <= y0) return 0;
  const h = (x: number) => Math.sqrt(Math.max(0, R * R - x * x));
  const G = (x: number) => (x * h(x) + R * R * Math.asin(Math.min(1, Math.max(-1, x / R)))) / 2;
  // Where h(x) crosses y0 or y1, the covered height changes its formula.
  const cuts = [a, b];
  for (const y of [y0, y1]) {
    // At |y| = R the crossing is x = 0, where the covered height changes too.
    if (Math.abs(y) <= R) {
      const x = Math.sqrt(R * R - y * y);
      for (const c of [-x, x]) if (c > a && c < b) cuts.push(c);
    }
  }
  cuts.sort((p, q) => p - q);
  let area = 0;
  for (let k = 0; k + 1 < cuts.length; k++) {
    const u = cuts[k] ?? 0;
    const v = cuts[k + 1] ?? 0;
    if (v <= u) continue;
    const hm = h((u + v) / 2);
    // Top is y1 or h, bottom is y0 or -h, fixed on this piece.
    const topIsH = hm < y1;
    const bottomIsH = -hm > y0;
    if ((topIsH ? hm : y1) <= (bottomIsH ? -hm : y0)) continue;
    const top = topIsH ? G(v) - G(u) : y1 * (v - u);
    const bottom = bottomIsH ? -(G(v) - G(u)) : y0 * (v - u);
    area += top - bottom;
  }
  return area;
}

/** Half-size of the kernel: cells whose square meets the disk lie within ceil(R - 1/2). */
export const diskRadius = (R: number) => Math.max(0, Math.ceil(R - 0.5));

/** The normalized disk kernel as rows. */
export function diskKernel(R: number): number[][] {
  if (!(R > 0)) throw new RangeError("The radius must be positive.");
  const r = diskRadius(R);
  const rows = Array.from({ length: 2 * r + 1 }, (_, j) =>
    Array.from({ length: 2 * r + 1 }, (_, i) =>
      diskBoxArea(R, i - r - 0.5, i - r + 0.5, j - r - 0.5, j - r + 0.5),
    ),
  );
  let total = 0;
  for (const row of rows) for (const v of row) total += v;
  return rows.map((row) => row.map((v) => v / total));
}

const radiusOf = (params: Params) => read.number(params, "radius", 3);

export const diskAverageFilter: PlaneFilter = {
  id: "disk-average",
  kind: "smooth",
  alphaWeighted: true,
  radius: (params) => diskRadius(radiusOf(params)),
  plane: (input, params, context) =>
    correlate2d(input, kernelFromRows(diskKernel(radiusOf(params))), context.border),
  representation: (params) => {
    const rows = diskKernel(radiusOf(params));
    const r = (rows.length - 1) >> 1;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "D",
          rows,
          anchor: { x: r, y: r },
          normalized: true,
          note: "Each weight is the part of the disk inside that cell. Edge cells are partly covered.",
        },
      ],
    };
  },
};
