/**
 * Sobel with non-maximum suppression. Catalog entry: catalog/filters/edges/sobel-nms.yaml.
 *
 * The Sobel magnitude is kept only where it is at least as large as both neighbors along the
 * gradient direction, so wide edge responses become lines one pixel thick. The direction is
 * rounded to one of four sectors, as in Gonzalez and Woods: the angle modulo 180 degrees below
 * 22.5 or from 157.5 compares the left and right neighbors, below 67.5 the neighbors down right
 * and up left, below 112.5 those above and below, and the rest down left and up right. The y
 * axis points down, so a gradient at 45 degrees points down right.
 *
 * The plane is extended once by two pixels with the border mode, so the Sobel values of the
 * neighbors are the same in strips and in whole images.
 */
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import type { PlaneFilter } from "@/core/filters/types";

import { sobelGradients } from "./sobel";

/** The neighbor offsets for each of the four sectors. */
const SECTORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
];

/** The sector, 0 to 3, of a gradient. */
export function sector(gx: number, gy: number): number {
  let a = (Math.atan2(gy, gx) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  if (a < 22.5 || a >= 157.5) return 0;
  if (a < 67.5) return 1;
  if (a < 112.5) return 2;
  return 3;
}

/** Thin a magnitude plane along the gradient. Positions past the edge repeat the edge. */
export function suppress(gx: Plane, gy: Plane): Plane {
  const { width, height } = gx;
  const magnitude = Float64Array.from(gx.data, (x, i) => Math.hypot(x, gy.data[i] ?? 0));
  const at = (x: number, y: number) =>
    magnitude[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ??
    0;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const m = magnitude[i] ?? 0;
      const [dx, dy] = SECTORS[sector(gx.data[i] ?? 0, gy.data[i] ?? 0)] ?? [1, 0];
      out.data[i] = m >= at(x + dx, y + dy) && m >= at(x - dx, y - dy) ? m : 0;
    }
  }
  return out;
}

export const sobelNmsFilter: PlaneFilter = {
  id: "sobel-nms",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 2,
  plane: (input, _params, { border }) => {
    const padded = padPlane(input, 2, border);
    const { gx, gy } = sobelGradients(padded, "replicate");
    return cropPlane(suppress(gx, gy), 2);
  },
  representation: () => ({
    kind: "window",
    size: 5,
    count: 25,
    statistic: "M(p) \\text{ if } M(p) \\ge M(p \\pm d_{\\theta}) \\text{ else } 0",
    note: "M is the Sobel magnitude and d_theta the step to the neighbor along the gradient, rounded to one of four directions. The Sobel kernels are on the Sobel page.",
  }),
};
