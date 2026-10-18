/**
 * Adaptive filters that scan the image and learn as they go. Catalog entries in
 * catalog/filters/adaptive/: lms-2d.yaml, rls-2d.yaml and kalman.yaml.
 *
 * - 2D LMS and 2D RLS predictors. Each pixel is predicted from the other pixels of the window
 *   around it, without the center, as in the two-dimensional LMS (TDLMS) of Hadhoud and Thomas.
 *   Noise that is not shared with the neighbors cannot be predicted, so the prediction is a
 *   denoised image. The weights start as the plain mean of the neighbors and change after every
 *   pixel, in raster order, from the error between the pixel and its prediction: normalized LMS,
 *   or RLS with a forgetting factor. Values are scaled to 0 to 1 first. In flat areas the
 *   neighbors carry little new information, and RLS with forgetting lets P grow without bound
 *   ("windup") until the weights explode. After each step, P is made symmetric again and its
 *   trace is capped at its starting trace, our safeguard against both rounding and windup.
 * - Kalman smoother. Each row is a first-order autoregressive signal, x_k = rho x_(k-1) + w_k,
 *   seen through white noise, y_k = x_k + v_k. A Kalman filter runs along the row and a
 *   Rauch-Tung-Striebel smoother runs back. The columns of the noisy image go through the same
 *   steps, and the result is the mean of the two. Rho and the signal variance are estimated from
 *   the image, after the noise variance is taken off, for rows and columns separately. This
 *   separable form is PixelNexus's own. It is not the reduced update Kalman filter of Woods and
 *   Radewan, which uses a two-dimensional image model. Filtering the columns of the row result
 *   instead was tried and rejected: that result looks almost noise free along the columns, so the
 *   estimated rho goes to 1 and the edges blur.
 *
 * The scans run through the whole image, so these filters are global.
 */
import { borderIndex, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

type Output = "prediction" | "error";

const sizeOf = (params: Params) => read.number(params, "size", 3);
const outputOf = (params: Params) => read.string<Output>(params, "output", "prediction");

/** The neighbors of (x, y) in a size x size window, without the center, scaled to 0 to 1. */
function neighbors(
  input: Plane,
  x: number,
  y: number,
  r: number,
  border: BorderMode,
  out: Float64Array,
): void {
  let n = 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = borderIndex(y + dy, input.height, border);
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = borderIndex(x + dx, input.width, border);
      out[n++] = yy < 0 || xx < 0 ? 0 : (input.data[yy * input.width + xx] ?? 0) / 255;
    }
  }
}

/** The output of a predictor: the prediction, or the error around mid gray. */
const written = (output: Output, d: number, prediction: number) =>
  output === "error" ? 128 + 255 * (d - prediction) : 255 * prediction;

/** 2D normalized LMS predictor: w <- w + mu e x / (eps + x.x). */
export function lmsPlane(
  input: Plane,
  size: number,
  mu: number,
  output: Output,
  border: BorderMode,
): Plane {
  const r = (size - 1) >> 1;
  const m = size * size - 1;
  const w = new Float64Array(m).fill(1 / m);
  const x = new Float64Array(m);
  const out = createPlane(input.width, input.height);
  for (let j = 0; j < input.height; j++) {
    for (let i = 0; i < input.width; i++) {
      neighbors(input, i, j, r, border, x);
      let prediction = 0;
      let energy = 1e-6;
      for (let k = 0; k < m; k++) {
        prediction += (w[k] ?? 0) * (x[k] ?? 0);
        energy += (x[k] ?? 0) ** 2;
      }
      const d = (input.data[j * input.width + i] ?? 0) / 255;
      const e = d - prediction;
      for (let k = 0; k < m; k++) w[k] = (w[k] ?? 0) + (mu * e * (x[k] ?? 0)) / energy;
      out.data[j * input.width + i] = written(output, d, prediction);
    }
  }
  return out;
}

/** 2D RLS predictor with forgetting factor lambda and P(0) = I / delta. */
export function rlsPlane(
  input: Plane,
  size: number,
  lambda: number,
  delta: number,
  output: Output,
  border: BorderMode,
): Plane {
  const r = (size - 1) >> 1;
  const m = size * size - 1;
  const w = new Float64Array(m).fill(1 / m);
  const p = new Float64Array(m * m);
  for (let k = 0; k < m; k++) p[k * m + k] = 1 / delta;
  const cap = m / delta;
  const x = new Float64Array(m);
  const pi = new Float64Array(m);
  const out = createPlane(input.width, input.height);
  for (let j = 0; j < input.height; j++) {
    for (let i = 0; i < input.width; i++) {
      neighbors(input, i, j, r, border, x);
      let prediction = 0;
      for (let k = 0; k < m; k++) prediction += (w[k] ?? 0) * (x[k] ?? 0);
      const d = (input.data[j * input.width + i] ?? 0) / 255;
      const e = d - prediction;
      // pi = P x, gain k = pi / (lambda + x.pi). P is symmetric, so x'P = pi'.
      let denominator = lambda;
      for (let a = 0; a < m; a++) {
        let sum = 0;
        for (let b = 0; b < m; b++) sum += (p[a * m + b] ?? 0) * (x[b] ?? 0);
        pi[a] = sum;
        denominator += (x[a] ?? 0) * sum;
      }
      for (let a = 0; a < m; a++) w[a] = (w[a] ?? 0) + ((pi[a] ?? 0) / denominator) * e;
      // P <- (P - k pi') / lambda
      for (let a = 0; a < m; a++) {
        const ka = (pi[a] ?? 0) / denominator;
        for (let b = 0; b < m; b++) {
          p[a * m + b] = ((p[a * m + b] ?? 0) - ka * (pi[b] ?? 0)) / lambda;
        }
      }
      // The safeguard: symmetric again, and the trace no larger than at the start.
      let trace = 0;
      for (let a = 0; a < m; a++) {
        for (let b = a + 1; b < m; b++) {
          const mean = ((p[a * m + b] ?? 0) + (p[b * m + a] ?? 0)) / 2;
          p[a * m + b] = mean;
          p[b * m + a] = mean;
        }
        trace += p[a * m + a] ?? 0;
      }
      if (trace > cap) for (let a = 0; a < m * m; a++) p[a] = ((p[a] ?? 0) * cap) / trace;
      out.data[j * input.width + i] = written(output, d, prediction);
    }
  }
  return out;
}

/** The AR(1) model of the lines of a plane, from its values, after the noise variance. */
export function arModel(
  lines: readonly Float64Array[],
  noiseVariance: number,
): { readonly mean: number; readonly rho: number; readonly variance: number } {
  let sum = 0;
  let count = 0;
  for (const line of lines) {
    for (const v of line) sum += v;
    count += line.length;
  }
  const mean = count ? sum / count : 0;
  let total = 0;
  let lag = 0;
  let pairs = 0;
  for (const line of lines) {
    for (let k = 0; k < line.length; k++) {
      const a = (line[k] ?? 0) - mean;
      total += a * a;
      if (k > 0) {
        lag += a * ((line[k - 1] ?? 0) - mean);
        pairs++;
      }
    }
  }
  // White noise adds to the variance but not to the covariance of neighbors.
  const variance = Math.max(count ? total / count - noiseVariance : 0, 1e-6);
  const rho = Math.min(Math.max(pairs ? lag / pairs / variance : 0, 0), 0.999);
  return { mean, rho, variance };
}

/**
 * Kalman filter forward along a line and Rauch-Tung-Striebel smoother back, for
 * x_k = rho x_(k-1) + w_k and y_k = x_k + v_k. Returns the smoothed line and the mean
 * variance left in it.
 */
export function kalmanLine(
  y: Float64Array,
  model: { readonly mean: number; readonly rho: number; readonly variance: number },
  noiseVariance: number,
): { readonly line: Float64Array; readonly variance: number } {
  const n = y.length;
  const { mean, rho, variance } = model;
  const q = variance * (1 - rho * rho);
  const filtered = new Float64Array(n);
  const filteredP = new Float64Array(n);
  const predicted = new Float64Array(n);
  const predictedP = new Float64Array(n);
  let state = 0;
  let p = variance;
  for (let k = 0; k < n; k++) {
    const s = k === 0 ? 0 : rho * state;
    const sp = k === 0 ? variance : rho * rho * p + q;
    const gain = sp / (sp + noiseVariance);
    state = s + gain * ((y[k] ?? 0) - mean - s);
    p = (1 - gain) * sp;
    predicted[k] = s;
    predictedP[k] = sp;
    filtered[k] = state;
    filteredP[k] = p;
  }
  const line = new Float64Array(n);
  let smooth = filtered[n - 1] ?? 0;
  let smoothP = filteredP[n - 1] ?? 0;
  let left = smoothP;
  line[n - 1] = smooth + mean;
  for (let k = n - 2; k >= 0; k--) {
    const g = ((filteredP[k] ?? 0) * rho) / (predictedP[k + 1] ?? 1);
    smooth = (filtered[k] ?? 0) + g * (smooth - (predicted[k + 1] ?? 0));
    smoothP = (filteredP[k] ?? 0) + g * g * (smoothP - (predictedP[k + 1] ?? 0));
    left += smoothP;
    line[k] = smooth + mean;
  }
  return { line, variance: n ? left / n : 0 };
}

/** The mean of a run along the rows and a run along the columns, both on the noisy image. */
export function kalmanPlane(input: Plane, sigma: number): Plane {
  const { width, height } = input;
  const noise = sigma * sigma;
  const rows = Array.from({ length: height }, (_, j) =>
    Float64Array.from(input.data.subarray(j * width, (j + 1) * width)),
  );
  const columns = Array.from({ length: width }, (_, i) =>
    Float64Array.from({ length: height }, (_, j) => input.data[j * width + i] ?? 0),
  );
  const rowModel = arModel(rows, noise);
  const columnModel = arModel(columns, noise);
  const out = createPlane(width, height);
  rows.forEach((row, j) => {
    const { line } = kalmanLine(row, rowModel, noise);
    for (let i = 0; i < width; i++) out.data[j * width + i] = (line[i] ?? 0) / 2;
  });
  columns.forEach((column, i) => {
    const { line } = kalmanLine(column, columnModel, noise);
    for (let j = 0; j < height; j++) out.data[j * width + i] += (line[j] ?? 0) / 2;
  });
  return out;
}

export const lms2dFilter: PlaneFilter = {
  id: "lms-2d",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    lmsPlane(input, sizeOf(params), read.number(params, "mu", 0.05), outputOf(params), border),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Predict",
        formula: "\\hat{d} = \\mathbf{w}^{\\top} \\mathbf{x}",
        note: `x holds the ${sizeOf(params) ** 2 - 1} neighbors in the ${sizeOf(params)} x ${sizeOf(params)} window, without the center.`,
      },
      {
        name: "Update",
        formula: `\\mathbf{w} \\leftarrow \\mathbf{w} + \\frac{${read.number(params, "mu", 0.05)}\\, e\\, \\mathbf{x}}{\\varepsilon + \\mathbf{x}^{\\top}\\mathbf{x}},\\quad e = d - \\hat{d}`,
        note: "Normalized LMS, after every pixel, in raster order.",
      },
    ],
  }),
};

export const rls2dFilter: PlaneFilter = {
  id: "rls-2d",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    rlsPlane(
      input,
      sizeOf(params),
      read.number(params, "lambda", 0.999),
      read.number(params, "delta", 0.01),
      outputOf(params),
      border,
    ),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Predict",
        formula: "\\hat{d} = \\mathbf{w}^{\\top} \\mathbf{x}",
        note: `x holds the ${sizeOf(params) ** 2 - 1} neighbors in the ${sizeOf(params)} x ${sizeOf(params)} window, without the center.`,
      },
      {
        name: "Update",
        formula: `\\mathbf{k} = \\frac{P \\mathbf{x}}{${read.number(params, "lambda", 0.999)} + \\mathbf{x}^{\\top} P \\mathbf{x}},\\quad \\mathbf{w} \\leftarrow \\mathbf{w} + \\mathbf{k} e,\\quad P \\leftarrow \\frac{P - \\mathbf{k}\\, \\mathbf{x}^{\\top} P}{${read.number(params, "lambda", 0.999)}}`,
        note: `RLS with forgetting factor lambda. P starts as I / ${read.number(params, "delta", 0.01)}. After each step P is made symmetric and its trace is capped at its start.`,
      },
    ],
  }),
};

export const kalmanFilter: PlaneFilter = {
  id: "kalman",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params) => kalmanPlane(input, read.number(params, "sigma", 20)),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Model",
        formula: "x_k = \\rho\\, x_{k-1} + w_k,\\quad y_k = x_k + v_k",
        note: `rho and the signal variance come from the image. The noise sigma is ${read.number(params, "sigma", 20)}.`,
      },
      {
        name: "Filter",
        formula:
          "K_k = \\frac{P_k^-}{P_k^- + \\sigma_v^2},\\quad \\hat{x}_k = \\hat{x}_k^- + K_k (y_k - \\hat{x}_k^-)",
        note: "Forward along each row.",
      },
      {
        name: "Smooth",
        formula:
          "G_k = \\frac{\\rho P_k}{P_{k+1}^-},\\quad \\hat{x}_k^s = \\hat{x}_k + G_k (\\hat{x}_{k+1}^s - \\hat{x}_{k+1}^-)",
        note: "Back along the row. Rows and columns of the noisy image each get a run, and the result is their mean.",
      },
    ],
  }),
};
