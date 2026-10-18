/**
 * Shared window machinery for the rank, mean and local statistics filters.
 *
 * Every helper works on a square window of side 2r + 1 around each pixel. Pixels outside the
 * plane come from the border rule. The constant mode reads them as 0, as SciPy does with
 * cval = 0, so they take part in the statistic.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";

/** The value at padded column i and padded row j, from border tables. */
function reader(input: Plane, xs: Int32Array, ys: Int32Array) {
  const { width, data } = input;
  return (i: number, j: number) => {
    const sx = xs[i] ?? -1;
    const sy = ys[j] ?? -1;
    return sx < 0 || sy < 0 ? 0 : (data[sy * width + sx] ?? 0);
  };
}

/**
 * Sum of `values` over each window, in float64. Running sums along rows, then along columns,
 * so the cost per pixel does not depend on the window size. In the constant mode, positions
 * outside the plane count as `outside`.
 */
export function windowSum(
  values: Float64Array,
  width: number,
  height: number,
  radius: number,
  border: BorderMode,
  outside = 0,
): Float64Array {
  const size = 2 * radius + 1;
  const xs = borderTable(width, radius, border);
  const ys = borderTable(height, radius, border);
  const rows = new Float64Array(width * height);
  const line = new Float64Array(Math.max(width, height) + 2 * radius);
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width + 2 * radius; i++) {
      const x = xs[i] ?? -1;
      line[i] = x < 0 ? outside : (values[y * width + x] ?? 0);
    }
    let sum = 0;
    for (let k = 0; k < size; k++) sum += line[k] ?? 0;
    for (let x = 0; x < width; x++) {
      rows[y * width + x] = sum;
      sum += (line[x + size] ?? 0) - (line[x] ?? 0);
    }
  }
  const out = new Float64Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let i = 0; i < height + 2 * radius; i++) {
      const y = ys[i] ?? -1;
      // A whole row outside the plane holds size values of `outside`.
      line[i] = y < 0 ? outside * size : (rows[y * width + x] ?? 0);
    }
    let sum = 0;
    for (let k = 0; k < size; k++) sum += line[k] ?? 0;
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum;
      sum += (line[y + size] ?? 0) - (line[y] ?? 0);
    }
  }
  return out;
}

/** windowSum of f(value) for every value of the plane. Outside values are 0, so they add f(0). */
export function windowSumOf(
  input: Plane,
  radius: number,
  border: BorderMode,
  f: (value: number) => number,
): Float64Array {
  const values = Float64Array.from(input.data, f);
  return windowSum(values, input.width, input.height, radius, border, f(0));
}

/**
 * The smallest or largest value of each window. A square window is the product of a row and a
 * column, so the extreme of the row extremes is the extreme of the window. This is also gray
 * erosion (min) and dilation (max) with a flat square structuring element.
 */
export function extremePlane(
  input: Plane,
  radius: number,
  border: BorderMode,
  kind: "min" | "max",
): Plane {
  const { width, height } = input;
  const better = kind === "min" ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
  const size = 2 * radius + 1;
  const xs = borderTable(width, radius, border);
  const ys = borderTable(height, radius, border);
  const rows = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = NaN;
      for (let k = 0; k < size; k++) {
        const sx = xs[x + k] ?? -1;
        const v = sx < 0 ? 0 : (input.data[y * width + sx] ?? 0);
        if (k === 0 || better(v, best)) best = v;
      }
      rows[y * width + x] = best;
    }
  }
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = NaN;
      for (let k = 0; k < size; k++) {
        const sy = ys[y + k] ?? -1;
        const v = sy < 0 ? 0 : (rows[sy * width + x] ?? 0);
        if (k === 0 || better(v, best)) best = v;
      }
      out.data[y * width + x] = best;
    }
  }
  return out;
}

/**
 * Collect the window of each pixel into a buffer, row by row from the top left, and let
 * `reduce` turn it into the output value. The buffer is reused, so `reduce` may sort it.
 */
export function gatherPlane(
  input: Plane,
  radius: number,
  border: BorderMode,
  reduce: (window: Float64Array, x: number, y: number) => number,
): Plane {
  const { width, height } = input;
  const size = 2 * radius + 1;
  const at = reader(input, borderTable(width, radius, border), borderTable(height, radius, border));
  const window = new Float64Array(size * size);
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let k = 0;
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) window[k++] = at(x + i, y + j);
      out.data[y * width + x] = reduce(window, x, y);
    }
  }
  return out;
}

/** Values are whole numbers from 0 to 255 in the histogram filters. */
export const toByte = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/**
 * A 256-bin histogram of each window, kept up to date as the window slides along a row
 * (Huang, Yang and Tang, 1979). Each step removes one column and adds one. `reduce` reads the
 * histogram and must not change it. Values are rounded to whole numbers first.
 */
export function histogramPlane(
  input: Plane,
  radius: number,
  border: BorderMode,
  reduce: (hist: Int32Array, count: number) => number,
): Plane {
  const { width, height } = input;
  const size = 2 * radius + 1;
  const at = reader(input, borderTable(width, radius, border), borderTable(height, radius, border));
  const hist = new Int32Array(256);
  const count = size * size;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    hist.fill(0);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const v = toByte(at(i, y + j));
        hist[v] = (hist[v] ?? 0) + 1;
      }
    }
    out.data[y * width] = reduce(hist, count);
    for (let x = 1; x < width; x++) {
      for (let j = 0; j < size; j++) {
        const a = toByte(at(x - 1, y + j));
        hist[a] = (hist[a] ?? 0) - 1;
        const b = toByte(at(x + size - 1, y + j));
        hist[b] = (hist[b] ?? 0) + 1;
      }
      out.data[y * width + x] = reduce(hist, count);
    }
  }
  return out;
}

/**
 * The value of 1-based rank `rank` in each sorted window, with a sliding histogram. The rank
 * pointer m moves only as far as the window changes, so the median of large windows stays fast.
 */
export function rankPlane(input: Plane, radius: number, rank: number, border: BorderMode): Plane {
  const { width, height } = input;
  const size = 2 * radius + 1;
  const at = reader(input, borderTable(width, radius, border), borderTable(height, radius, border));
  const hist = new Int32Array(256);
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    hist.fill(0);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const v = toByte(at(i, y + j));
        hist[v] = (hist[v] ?? 0) + 1;
      }
    }
    // m is the answer. below counts the values smaller than m.
    let m = 0;
    let below = 0;
    while (below + (hist[m] ?? 0) < rank) below += hist[m++] ?? 0;
    out.data[y * width] = m;
    for (let x = 1; x < width; x++) {
      for (let j = 0; j < size; j++) {
        const a = toByte(at(x - 1, y + j));
        hist[a] = (hist[a] ?? 0) - 1;
        if (a < m) below -= 1;
        const b = toByte(at(x + size - 1, y + j));
        hist[b] = (hist[b] ?? 0) + 1;
        if (b < m) below += 1;
      }
      // Move m down while too many values lie below it, then up while too few reach it.
      while (below >= rank) below -= hist[--m] ?? 0;
      while (below + (hist[m] ?? 0) < rank) below += hist[m++] ?? 0;
      out.data[y * width + x] = m;
    }
  }
  return out;
}
