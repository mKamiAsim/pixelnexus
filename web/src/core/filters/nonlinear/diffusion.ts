/**
 * Anisotropic diffusion (Perona and Malik, 1990), and its color version with one shared
 * diffusivity (Sapiro and Ringach, 1996). Catalog entries:
 * catalog/filters/nonlinear/anisotropic-diffusion.yaml and vector-anisotropic-diffusion.yaml.
 *
 * Each step moves every value toward its four neighbors:
 *
 *   I <- I + lambda (c_N d_N + c_S d_S + c_E d_E + c_W d_W),   d_N = I(x, y - 1) - I(x, y)
 *
 * The conduction c = g(|d|) is near 1 for small differences and near 0 for large ones, so flat
 * areas smooth and edges stay. g is exp(-(d/K)^2) or 1 / (1 + (d/K)^2).
 *
 * Information moves one pixel per step, so the filter needs a halo of one pixel per step. The
 * plane is extended once by that many pixels with the border mode, then all steps run on the
 * extended plane, and the frame is cut off. For
 * the reflect modes and wrap, this equals applying the border rule at every step, because the
 * diffusion keeps the mirror and periodic symmetry. Reflect is the zero-flux boundary of the paper.
 */
import {
  createPlane,
  cropPlane,
  padPlane,
  type BorderMode,
  type Plane,
} from "@/core/filters/planes";
import { read, type ColorFilter, type Params, type PlaneFilter } from "@/core/filters/types";

export type Conduction = "exponential" | "quadratic";

const stepsOf = (params: Params) => Math.round(read.number(params, "iterations", 15));
const kappaOf = (params: Params) => read.number(params, "kappa", 20);
const lambdaOf = (params: Params) => read.number(params, "lambda", 0.2);
const conductionOf = (params: Params) =>
  read.string<Conduction>(params, "conduction", "exponential");

/** The conduction function g for a difference d. */
export function conduction(kind: Conduction, kappa: number): (d: number) => number {
  return kind === "quadratic"
    ? (d) => 1 / (1 + (d / kappa) ** 2)
    : (d) => Math.exp(-((d / kappa) ** 2));
}

/**
 * Run the steps on a set of planes. With `shared`, all planes use one conduction from the
 * length of the color difference, the vector version. Positions past the plane edge repeat the
 * edge value, which only touches the halo.
 */
export function diffuse(
  planes: readonly Plane[],
  steps: number,
  lambda: number,
  g: (d: number) => number,
  shared: boolean,
): Plane[] {
  const { width, height } = planes[0] as Plane;
  let current = planes.map((p) => Float64Array.from(p.data));
  const offsets = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ] as const;
  const diffs = new Float64Array(planes.length);
  for (let step = 0; step < steps; step++) {
    const next = current.map((p) => Float64Array.from(p));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        for (const [dx, dy] of offsets) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const j = ny * width + nx;
          let length2 = 0;
          current.forEach((p, c) => {
            const d = (p[j] ?? 0) - (p[i] ?? 0);
            diffs[c] = d;
            length2 += d * d;
          });
          const common = shared ? g(Math.sqrt(length2)) : 0;
          next.forEach((p, c) => {
            const d = diffs[c] ?? 0;
            p[i] = (p[i] ?? 0) + lambda * (shared ? common : g(Math.abs(d))) * d;
          });
        }
      }
    }
    current = next;
  }
  return current.map((data) => {
    const out = createPlane(width, height);
    out.data.set(data);
    return out;
  });
}

/** Extend the planes by one pixel per step, diffuse, and cut the frame off again. */
function diffuseWithBorder(
  planes: readonly Plane[],
  params: Params,
  border: BorderMode,
  shared: boolean,
): Plane[] {
  const steps = stepsOf(params);
  const g = conduction(conductionOf(params), kappaOf(params));
  const padded = planes.map((p) => padPlane(p, steps, border));
  return diffuse(padded, steps, lambdaOf(params), g, shared).map((p) => cropPlane(p, steps));
}

const update = (lambda: number, kappa: number, kind: Conduction) =>
  `I \\leftarrow I + ${lambda} \\sum_{n \\in \\{N,S,E,W\\}} g(\\nabla_n I)\\, \\nabla_n I,\\quad g(d) = ${
    kind === "quadratic" ? `\\frac{1}{1 + (d/${kappa})^2}` : `e^{-(d/${kappa})^2}`
  }`;

export const anisotropicDiffusionFilter: PlaneFilter = {
  id: "anisotropic-diffusion",
  kind: "smooth",
  alphaWeighted: false,
  radius: stepsOf,
  plane: (input, params, { border }) =>
    diffuseWithBorder([input], params, border, false)[0] as Plane,
  representation: (params) => ({
    kind: "iterative",
    iterations: stepsOf(params),
    update: update(lambdaOf(params), kappaOf(params), conductionOf(params)),
    note: "Each step moves every value toward its four neighbors. The conduction g is near 1 for small differences and near 0 across edges, so flat areas smooth and edges stay.",
  }),
};

export const vectorAnisotropicDiffusionFilter: ColorFilter = {
  id: "vector-anisotropic-diffusion",
  kind: "color",
  radius: stepsOf,
  color: (planes, params, { border }) =>
    diffuseWithBorder(planes, params, border, true) as [Plane, Plane, Plane],
  representation: (params) => ({
    kind: "iterative",
    iterations: stepsOf(params),
    update: update(lambdaOf(params), kappaOf(params), conductionOf(params)).replace(
      "g(\\nabla_n I)",
      "g(\\lVert \\nabla_n \\mathbf{I} \\rVert)",
    ),
    note: "Like the scalar version, but one conduction for all three channels, from the length of the color difference. An edge in any channel stops the diffusion in all of them, so colors do not bleed.",
  }),
};
