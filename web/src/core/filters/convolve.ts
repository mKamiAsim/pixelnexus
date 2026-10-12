/**
 * Correlation with border handling. Kernels are applied as correlation, as OpenCV and
 * scipy.ndimage.correlate do: out(x) = sum_i k(i) * in(x + i). For a symmetric kernel this is
 * the same as convolution. The Inspector can show the flipped kernel for true convolution.
 *
 * Sums run in float64 and are stored as float32.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "./planes";

/** A kernel with an anchor. Weight rows[j][i] multiplies the pixel at (x + i - ax, y + j - ay). */
export interface Kernel2d {
  readonly width: number;
  readonly height: number;
  /** Weights row by row. */
  readonly weights: Float64Array;
  readonly anchorX: number;
  readonly anchorY: number;
}

export function kernelFromRows(rows: readonly (readonly number[])[]): Kernel2d {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const weights = new Float64Array(width * height);
  rows.forEach((row, j) => row.forEach((value, i) => (weights[j * width + i] = value)));
  return {
    width,
    height,
    weights,
    anchorX: Math.floor(width / 2),
    anchorY: Math.floor(height / 2),
  };
}

export function kernelRows(kernel: Kernel2d): number[][] {
  return Array.from({ length: kernel.height }, (_, j) =>
    Array.from(kernel.weights.subarray(j * kernel.width, (j + 1) * kernel.width)),
  );
}

/** Correlate every row with a centered odd-length 1D kernel. */
export function correlateRows(input: Plane, kernel: ArrayLike<number>, border: BorderMode): Plane {
  const { width, height, data } = input;
  const radius = (kernel.length - 1) >> 1;
  const table = borderTable(width, radius, border);
  const out = createPlane(width, height);
  const row = new Float64Array(width + 2 * radius);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let i = 0; i < row.length; i++) {
      const x = table[i] ?? -1;
      row[i] = x < 0 ? 0 : (data[base + x] ?? 0);
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) sum += (kernel[k] ?? 0) * (row[x + k] ?? 0);
      out.data[base + x] = sum;
    }
  }
  return out;
}

/** Correlate every column with a centered odd-length 1D kernel. */
export function correlateColumns(
  input: Plane,
  kernel: ArrayLike<number>,
  border: BorderMode,
): Plane {
  const { width, height, data } = input;
  const radius = (kernel.length - 1) >> 1;
  const table = borderTable(height, radius, border);
  const out = createPlane(width, height);
  const column = new Float64Array(height + 2 * radius);
  for (let x = 0; x < width; x++) {
    for (let i = 0; i < column.length; i++) {
      const y = table[i] ?? -1;
      column[i] = y < 0 ? 0 : (data[y * width + x] ?? 0);
    }
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) sum += (kernel[k] ?? 0) * (column[y + k] ?? 0);
      out.data[y * width + x] = sum;
    }
  }
  return out;
}

/** Separable correlation: rows first, then columns. */
export function correlateSeparable(
  input: Plane,
  rowKernel: ArrayLike<number>,
  columnKernel: ArrayLike<number>,
  border: BorderMode,
): Plane {
  return correlateColumns(correlateRows(input, rowKernel, border), columnKernel, border);
}

/** General 2D correlation. Zero weights are skipped. */
export function correlate2d(input: Plane, kernel: Kernel2d, border: BorderMode): Plane {
  const { width, height, data } = input;
  const out = createPlane(width, height);
  const taps: { dx: number; dy: number; w: number }[] = [];
  for (let j = 0; j < kernel.height; j++) {
    for (let i = 0; i < kernel.width; i++) {
      const w = kernel.weights[j * kernel.width + i] ?? 0;
      if (w !== 0) taps.push({ dx: i - kernel.anchorX, dy: j - kernel.anchorY, w });
    }
  }
  const padX = Math.max(kernel.anchorX, kernel.width - 1 - kernel.anchorX);
  const padY = Math.max(kernel.anchorY, kernel.height - 1 - kernel.anchorY);
  const xs = borderTable(width, padX, border);
  const ys = borderTable(height, padY, border);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (const { dx, dy, w } of taps) {
        const sy = ys[y + dy + padY] ?? -1;
        const sx = xs[x + dx + padX] ?? -1;
        if (sx >= 0 && sy >= 0) sum += w * (data[sy * width + sx] ?? 0);
      }
      out.data[y * width + x] = sum;
    }
  }
  return out;
}

/**
 * Mean over a size x size window with running sums. The cost per pixel does not depend on the
 * window size. Equal to correlating with a kernel of 1 / size^2 everywhere.
 */
export function boxMean(input: Plane, size: number, border: BorderMode): Plane {
  const radius = (size - 1) >> 1;
  const rows = runningMeanRows(input, radius, border);
  return runningMeanColumns(rows, radius, border);
}

function runningMeanRows(input: Plane, radius: number, border: BorderMode): Plane {
  const { width, height, data } = input;
  const size = 2 * radius + 1;
  const table = borderTable(width, radius, border);
  const out = createPlane(width, height);
  const row = new Float64Array(width + 2 * radius);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let i = 0; i < row.length; i++) {
      const x = table[i] ?? -1;
      row[i] = x < 0 ? 0 : (data[base + x] ?? 0);
    }
    let sum = 0;
    for (let k = 0; k < size; k++) sum += row[k] ?? 0;
    for (let x = 0; x < width; x++) {
      out.data[base + x] = sum / size;
      sum += (row[x + size] ?? 0) - (row[x] ?? 0);
    }
  }
  return out;
}

function runningMeanColumns(input: Plane, radius: number, border: BorderMode): Plane {
  const { width, height, data } = input;
  const size = 2 * radius + 1;
  const table = borderTable(height, radius, border);
  const out = createPlane(width, height);
  const column = new Float64Array(height + 2 * radius);
  for (let x = 0; x < width; x++) {
    for (let i = 0; i < column.length; i++) {
      const y = table[i] ?? -1;
      column[i] = y < 0 ? 0 : (data[y * width + x] ?? 0);
    }
    let sum = 0;
    for (let k = 0; k < size; k++) sum += column[k] ?? 0;
    for (let y = 0; y < height; y++) {
      out.data[y * width + x] = sum / size;
      sum += (column[y + size] ?? 0) - (column[y] ?? 0);
    }
  }
  return out;
}
