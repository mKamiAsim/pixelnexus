/**
 * Median filter. Catalog entry: catalog/filters/nonlinear/median.yaml.
 *
 * The median of each size x size window comes from a 256-bin histogram that slides along the
 * row (Huang, Yang and Tang, 1979). Each step removes one column of the window and adds one,
 * so the cost per pixel grows with the window width, not its area.
 *
 * Values are whole numbers from 0 to 255. Brightness planes are rounded to whole values first.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const sizeOf = (params: Params) => read.number(params, "size", 3);

/** The window as the Rank stepper and the Inspector show it. */
export function medianWindow(size: number): { size: number; count: number; rank: number } {
  const count = size * size;
  return { size, count, rank: (count + 1) / 2 };
}

const toByte = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

export function medianPlane(input: Plane, size: number, border: BorderMode): Plane {
  const { width, height, data } = input;
  const radius = (size - 1) >> 1;
  const xs = borderTable(width, radius, border);
  const ys = borderTable(height, radius, border);
  const out = createPlane(width, height);
  const half = (size * size + 1) / 2;
  const hist = new Int32Array(256);
  // Value at image (x, y) after the border rule. The constant mode gives 0.
  const at = (sx: number, sy: number) =>
    sx < 0 || sy < 0 ? 0 : toByte(data[sy * width + sx] ?? 0);

  for (let y = 0; y < height; y++) {
    hist.fill(0);
    const rowsInWindow = Array.from({ length: size }, (_, j) => ys[y + j] ?? -1);
    for (let i = 0; i < size; i++) {
      const sx = xs[i] ?? -1;
      for (const sy of rowsInWindow) {
        const v = at(sx, sy);
        hist[v] = (hist[v] ?? 0) + 1;
      }
    }
    // m is the median. below counts the values smaller than m.
    let m = 0;
    let below = 0;
    while (below + (hist[m] ?? 0) < half) below += hist[m++] ?? 0;
    out.data[y * width] = m;

    for (let x = 1; x < width; x++) {
      const leaving = xs[x - 1] ?? -1;
      const entering = xs[x + size - 1] ?? -1;
      for (const sy of rowsInWindow) {
        const a = at(leaving, sy);
        hist[a] = (hist[a] ?? 0) - 1;
        if (a < m) below -= 1;
        const b = at(entering, sy);
        hist[b] = (hist[b] ?? 0) + 1;
        if (b < m) below += 1;
      }
      // Move m down while too many values lie below it, then up while too few reach it.
      while (below >= half) below -= hist[--m] ?? 0;
      while (below + (hist[m] ?? 0) < half) below += hist[m++] ?? 0;
      out.data[y * width + x] = m;
    }
  }
  return out;
}

export const medianFilter: PlaneFilter = {
  id: "median",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (sizeOf(params) - 1) >> 1,
  plane: (input, params, context) => medianPlane(input, sizeOf(params), context.border),
  representation: (params) => {
    const { size, count, rank } = medianWindow(sizeOf(params));
    return { kind: "rank", size, count, rank };
  },
};
