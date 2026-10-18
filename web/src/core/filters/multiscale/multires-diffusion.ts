/**
 * Multiresolution diffusion. Catalog entry: catalog/filters/multiscale/multires-diffusion.yaml.
 *
 * Definitions vary in the literature. This is a documented variant of PixelNexus, close in idea
 * to the multigrid anisotropic diffusion of Acton (1998):
 *
 *   1. Build the Gaussian pyramid G_0 (the image) to G_L, with REDUCE of Burt and Adelson.
 *   2. Diffuse the coarsest level: u_L = D(G_L).
 *   3. For k = L - 1 down to 0: u_k = D(G_k + EXPAND(u_(k+1) - G_(k+1))).
 *
 * D is n steps of Perona-Malik diffusion with the edges of each level repeated, the zero-flux
 * boundary. At a coarse level one step moves information 2^k pixels of the image, so noise
 * blotches that are wider than a few pixels go in a few steps. Each finer level starts from the
 * smoothing of the level above, carried up as a correction, and refines it near edges.
 */
import { conduction, diffuse, type Conduction } from "@/core/filters/nonlinear/diffusion";
import { expand, gaussianPyramid } from "@/core/filters/multiscale/pyramid";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const levelsOf = (params: Params) => Math.round(read.number(params, "levels", 3));
const stepsOf = (params: Params) => Math.round(read.number(params, "iterations", 10));
const kappaOf = (params: Params) => read.number(params, "kappa", 20);
const lambdaOf = (params: Params) => read.number(params, "lambda", 0.2);
const conductionOf = (params: Params) =>
  read.string<Conduction>(params, "conduction", "exponential");

export function multiresDiffusion(
  input: Plane,
  levels: number,
  steps: number,
  kappa: number,
  lambda: number,
  kind: Conduction,
  border: BorderMode,
): Plane {
  const g = conduction(kind, kappa);
  const pyramid = gaussianPyramid(input, levels, border);
  const coarsest = pyramid[pyramid.length - 1] as Plane;
  let u = diffuse([coarsest], steps, lambda, g, false)[0] as Plane;
  for (let k = pyramid.length - 2; k >= 0; k--) {
    const level = pyramid[k] as Plane;
    const above = pyramid[k + 1] as Plane;
    const change = createPlane(above.width, above.height);
    for (let i = 0; i < change.data.length; i++) {
      change.data[i] = (u.data[i] ?? 0) - (above.data[i] ?? 0);
    }
    const carried = expand(change, level.width, level.height, border);
    const start = createPlane(level.width, level.height);
    for (let i = 0; i < start.data.length; i++) {
      start.data[i] = (level.data[i] ?? 0) + (carried.data[i] ?? 0);
    }
    u = diffuse([start], steps, lambda, g, false)[0] as Plane;
  }
  return u;
}

export const multiresDiffusionFilter: PlaneFilter = {
  id: "multires-diffusion",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    multiresDiffusion(
      input,
      levelsOf(params),
      stepsOf(params),
      kappaOf(params),
      lambdaOf(params),
      conductionOf(params),
      border,
    ),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Pyramid",
        formula: `G_{k+1} = \\operatorname{REDUCE}(G_k),\\quad k = 0 \\ldots ${levelsOf(params) - 1}`,
        note: "The Gaussian pyramid of Burt and Adelson.",
      },
      {
        name: "Coarsest level",
        formula: "u_L = D(G_L)",
        note: `D is ${stepsOf(params)} steps of Perona-Malik diffusion with K = ${kappaOf(params)} and lambda = ${lambdaOf(params)}.`,
      },
      {
        name: "Up the pyramid",
        formula: "u_k = D\\big(G_k + \\operatorname{EXPAND}(u_{k+1} - G_{k+1})\\big)",
        note: "Each finer level starts from the smoothing of the level above.",
      },
    ],
  }),
};
