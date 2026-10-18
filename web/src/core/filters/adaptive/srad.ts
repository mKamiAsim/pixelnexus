/**
 * Speckle reducing anisotropic diffusion, SRAD (Yu and Acton, 2002). Catalog entry:
 * catalog/filters/adaptive/srad.yaml.
 *
 * Each step uses the instantaneous coefficient of variation q of every pixel, from the
 * differences to its four neighbors:
 *
 *   q^2 = (1/2 (|grad I| / I)^2 - 1/16 (lap I / I)^2) / (1 + 1/4 lap I / I)^2
 *
 * with |grad I|^2 the sum of the four squared differences and lap I their sum. The diffusion
 * coefficient is c = 1 / (1 + (q^2 - q0^2) / (q0^2 (1 + q0^2))), where q0 is the speckle scale.
 * It falls with time as q0(t) = q0 exp(-rho t), as in the paper. Then
 *
 *   I <- I + (dt / 4) (c_S d_S + c_N d_N + c_E d_E + c_W d_W)
 *
 * with c_N = c_W = c at the pixel and c_S, c_E at the south and east neighbors. c is limited to
 * 0 to 1, which keeps the explicit scheme stable for dt up to 1. The plane is extended once by
 * one pixel per step, as for anisotropic diffusion.
 */
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const stepsOf = (params: Params) => Math.round(read.number(params, "iterations", 30));
const dtOf = (params: Params) => read.number(params, "dt", 0.1);
const q0Of = (params: Params) => read.number(params, "q0", 0.25);
const rhoOf = (params: Params) => read.number(params, "rho", 1 / 6);

/** Avoids a division by 0 on black pixels. */
const TINY = 1e-12;

/** One SRAD step with speckle scale q0 on a plane. Positions past the edge repeat the edge. */
export function sradStep(plane: Plane, dt: number, q0: number): Plane {
  const { width, height, data } = plane;
  const at = (x: number, y: number) =>
    data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
  const q0s = q0 * q0;
  const c = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = at(x, y);
      const dN = at(x, y - 1) - v;
      const dS = at(x, y + 1) - v;
      const dW = at(x - 1, y) - v;
      const dE = at(x + 1, y) - v;
      const g2 = (dN * dN + dS * dS + dW * dW + dE * dE) / (v * v + TINY);
      const lap = (dN + dS + dW + dE) / (v + TINY);
      const q2 = (0.5 * g2 - (lap * lap) / 16) / ((1 + lap / 4) ** 2 + TINY);
      const coefficient = 1 / (1 + (q2 - q0s) / (q0s * (1 + q0s) + TINY));
      c[y * width + x] = Math.min(1, Math.max(0, coefficient));
    }
  }
  const cAt = (x: number, y: number) =>
    c[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = at(x, y);
      const here = cAt(x, y);
      const divergence =
        cAt(x, y + 1) * (at(x, y + 1) - v) +
        here * (at(x, y - 1) - v) +
        cAt(x + 1, y) * (at(x + 1, y) - v) +
        here * (at(x - 1, y) - v);
      out.data[y * width + x] = v + (dt / 4) * divergence;
    }
  }
  return out;
}

export const sradFilter: PlaneFilter = {
  id: "srad",
  kind: "smooth",
  alphaWeighted: false,
  radius: stepsOf,
  plane: (input, params, { border }) => {
    const steps = stepsOf(params);
    const dt = dtOf(params);
    let plane = padPlane(input, steps, border);
    for (let t = 0; t < steps; t++) {
      plane = sradStep(plane, dt, q0Of(params) * Math.exp(-rhoOf(params) * t * dt));
    }
    return cropPlane(plane, steps);
  },
  representation: (params) => ({
    kind: "iterative",
    iterations: stepsOf(params),
    update: `I \\leftarrow I + \\frac{${dtOf(params)}}{4}\\operatorname{div}(c \\nabla I),\\quad c = \\frac{1}{1 + \\frac{q^2 - q_0^2}{q_0^2 (1 + q_0^2)}}`,
    note: `q is the local coefficient of variation from the four neighbor differences, and q_0 = ${q0Of(params)} e^{-${rhoOf(params).toFixed(3)} t} is the speckle scale. Where q is near q_0 the area is speckle and diffuses. Where q is larger, there is an edge, and c is near 0.`,
  }),
};
