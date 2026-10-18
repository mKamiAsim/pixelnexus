/**
 * Adaptive median filter (Hwang and Haddad, 1995), in the two-stage form of Gonzalez and Woods,
 * section 5.3. Catalog entry: catalog/filters/nonlinear/adaptive-median.yaml.
 *
 * Stage A: if z_min < z_med < z_max, the median is not an impulse, so go to stage B. Otherwise
 * grow the window by 2 and try again. When the window would pass the largest size, output z_med.
 * Stage B: if z_min < z_xy < z_max, the pixel is not an impulse, so keep it. Otherwise output
 * z_med.
 *
 * The min, median and max of every window size are computed once as whole planes, then each
 * pixel walks through the sizes. Values are whole numbers from 0 to 255.
 */
import { createPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { extremePlane, rankPlane, toByte } from "./window";

const maxSizeOf = (params: Params) => read.number(params, "maxSize", 7);

/** The window sizes the filter tries, from 3 up to the largest size. */
export function adaptiveSizes(maxSize: number): number[] {
  const sizes: number[] = [];
  for (let s = 3; s <= Math.max(3, maxSize); s += 2) sizes.push(s);
  return sizes;
}

export const adaptiveMedianFilter: PlaneFilter = {
  id: "adaptive-median",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (Math.max(3, maxSizeOf(params)) - 1) >> 1,
  plane: (input, params, { border }) => {
    const whole: Plane = { ...input, data: Float32Array.from(input.data, toByte) };
    const levels = adaptiveSizes(maxSizeOf(params)).map((size) => {
      const r = (size - 1) >> 1;
      return {
        min: extremePlane(whole, r, border, "min").data,
        med: rankPlane(whole, r, (size * size + 1) / 2, border).data,
        max: extremePlane(whole, r, border, "max").data,
      };
    });
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) {
      const z = whole.data[i] ?? 0;
      let value = Number.NaN;
      for (const { min, med, max } of levels) {
        const lo = min[i] ?? 0;
        const m = med[i] ?? 0;
        const hi = max[i] ?? 0;
        if (lo < m && m < hi) {
          value = lo < z && z < hi ? z : m;
          break;
        }
      }
      // No size had a median between its min and max: output the median of the largest window.
      out.data[i] = Number.isNaN(value) ? (levels.at(-1)?.med[i] ?? z) : value;
    }
    return out;
  },
  representation: (params) => {
    const sizes = adaptiveSizes(maxSizeOf(params));
    const last = sizes.at(-1) ?? 3;
    return {
      kind: "window",
      size: last,
      count: last * last,
      statistic: "z_{xy} \\text{ or } z_{\\text{med}}",
      note: `The window starts at 3x3 and grows to ${last}x${last} until its median lies strictly between its min and max. Then the pixel is kept if it also lies strictly between them, and replaced by the median if not.`,
    };
  },
};
