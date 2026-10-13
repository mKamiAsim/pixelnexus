/**
 * Steerable filters: the first and second derivative of a Gaussian, turned to any angle by
 * mixing a few basis filters. Catalog entry: catalog/filters/linear/steerable.yaml.
 *
 * The basis filters are the derivatives of the normalized Gaussian, built as in
 * scipy.ndimage.gaussian_filter with an order and cut at 4 sigma. The first derivative uses
 * G_x and G_y. The second uses G_xx, G_xy and G_yy, which span the same filters as the three
 * rotated copies of Freeman and Adelson. The direction at angle t is (cos t, -sin t) in image
 * coordinates, where y points down, so angles turn counterclockwise on screen:
 *
 *   order 1:  D_t = cos t G_x - sin t G_y
 *   order 2:  D_t = cos^2 t G_xx - 2 cos t sin t G_xy + sin^2 t G_yy
 *
 * The strongest output is the largest |D_t| over all angles: the gradient magnitude for order 1,
 * and the Hessian eigenvalue of largest size for order 2. The angle output is the angle where it
 * is reached, above -180 and up to 180 degrees for order 1, and from 0 up to 180 for order 2.
 * Angles within 1e-9 of the excluded end move to the other end, so a zero that rounds to a tiny
 * negative or positive value gives one answer. Where the
 * response does not depend on the angle, because the gradient or the spread of the Hessian
 * eigenvalues is below FLAT, the angle is 0. Mirrored borders give such points at the corners.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { gaussianSecondDerivative } from "@/core/filters/linear/dog-log";
import { gaussianKernel1d, gaussianRadius } from "@/core/filters/linear/gaussian";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type KernelInfo, type Params, type PlaneFilter } from "@/core/filters/types";

/** The kernels are cut at 4 sigma, the default of scipy.ndimage.gaussian_filter. */
const TRUNCATE = 4;

/**
 * Correlation weights for the first derivative of the normalized Gaussian, as in SciPy. They
 * give the derivative of the smoothed image along the axis.
 */
export function gaussianFirstDerivative(sigma: number, truncate = TRUNCATE): Float64Array {
  const r = gaussianRadius(sigma, truncate);
  const g = gaussianKernel1d(sigma, truncate);
  return Float64Array.from(g, (phi, i) => (phi * (i - r)) / (sigma * sigma));
}

type Order = 1 | 2;

/** The 1D factors (along x, along y) and the name of each basis filter. */
function basisFactors(sigma: number, order: Order) {
  const g = gaussianKernel1d(sigma, TRUNCATE);
  const d1 = gaussianFirstDerivative(sigma);
  if (order === 1) {
    return [
      { name: "G_x", row: d1, column: g },
      { name: "G_y", row: g, column: d1 },
    ];
  }
  const d2 = gaussianSecondDerivative(sigma, TRUNCATE);
  return [
    { name: "G_{xx}", row: d2, column: g },
    { name: "G_{xy}", row: d1, column: d1 },
    { name: "G_{yy}", row: g, column: d2 },
  ];
}

/** The weights that steer the basis to an angle in degrees. */
export function steeringWeights(order: Order, angle: number): number[] {
  const t = (angle * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return order === 1 ? [c, -s] : [c * c, -2 * c * s, s * s];
}

/** The basis responses of one plane. */
export function steerableBasis(
  input: Plane,
  sigma: number,
  order: Order,
  border: BorderMode,
): Plane[] {
  return basisFactors(sigma, order).map(({ row, column }) =>
    correlateSeparable(input, row, column, border),
  );
}

type SteerOutput = "steered" | "strongest" | "angle";

const sigmaOf = (params: Params) => read.number(params, "sigma", 2);
const orderOf = (params: Params): Order =>
  read.string<"1" | "2">(params, "order", "1") === "2" ? 2 : 1;
const angleOf = (params: Params) => read.number(params, "angle", 0);
const DEG = 180 / Math.PI;
/** An angle within 1e-9 of the low end of a 360 degree range moves to the high end. */
const wrapAbove = (a: number, low: number) => (a <= low + 1e-9 ? low + 360 : a);
/** An angle within 1e-9 of the high end of a 180 degree range moves to the low end. */
const wrapBelow = (a: number, high: number) => (a >= high - 1e-9 ? high - 180 : a);
/** Below this, the angle is undefined and the angle output is 0. */
export const FLAT = 1e-6;

export const steerableFilter: PlaneFilter = {
  id: "steerable",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(sigmaOf(params), TRUNCATE),
  plane: (input, params, { border }) => {
    const order = orderOf(params);
    const output = read.string<SteerOutput>(params, "output", "steered");
    const basis = steerableBasis(input, sigmaOf(params), order, border);
    const out = createPlane(input.width, input.height);
    const weights = steeringWeights(order, angleOf(params));
    for (let i = 0; i < out.data.length; i++) {
      const b = basis.map((p) => p.data[i] ?? 0);
      if (output === "steered") {
        out.data[i] = b.reduce((sum, v, j) => sum + v * (weights[j] ?? 0), 0);
      } else if (order === 1) {
        const [gx = 0, gy = 0] = b;
        const strength = Math.hypot(gx, gy);
        if (output === "strongest") out.data[i] = strength;
        else out.data[i] = strength < FLAT ? 0 : wrapAbove(Math.atan2(-gy, gx) * DEG, -180);
      } else {
        const [xx = 0, xy = 0, yy = 0] = b;
        const mean = (xx + yy) / 2;
        const spread = Math.hypot((xx - yy) / 2, xy);
        if (output === "strongest") {
          out.data[i] = Math.abs(mean) + spread;
        } else if (spread < FLAT) {
          out.data[i] = 0;
        } else {
          // The eigenvector of the larger eigenvalue points at 0.5 atan2(2 xy, xx - yy) in image
          // coordinates. The smaller one is at right angles. The angle turns the other way.
          const phi = 0.5 * Math.atan2(2 * xy, xx - yy) * DEG + (mean >= 0 ? 0 : 90);
          out.data[i] = wrapBelow((((-phi % 180) + 180) % 180) + 0, 180);
        }
      }
    }
    return out;
  },
  representation: (params) => {
    const order = orderOf(params);
    const weights = steeringWeights(order, angleOf(params));
    const r = gaussianRadius(sigmaOf(params), TRUNCATE);
    const fmt = (v: number) => String(Number(v.toFixed(4)));
    return {
      kind: "kernels",
      kernels: basisFactors(sigmaOf(params), order).map(({ name, row, column }, j): KernelInfo => ({
        name,
        rows: Array.from(column, (cy) => Array.from(row, (rx) => cy * rx)),
        anchor: { x: r, y: r },
        normalized: false,
        separable: { column: Array.from(column), row: Array.from(row) },
        note: `Weight ${fmt(weights[j] ?? 0)} at angle ${angleOf(params)} degrees.`,
      })),
    };
  },
};
