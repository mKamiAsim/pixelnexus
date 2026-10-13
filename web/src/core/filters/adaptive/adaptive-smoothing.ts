/**
 * Adaptive smoothing (Saint-Marc, Chen and Medioni, 1991). Catalog entry:
 * catalog/filters/adaptive/adaptive-smoothing.yaml.
 *
 * Each step replaces a pixel by a weighted mean of its 3x3 window. The weight of a pixel falls
 * with its own gradient: w = exp(-|G|^2 / (2 k^2)), where G comes from central differences,
 * G_x = (I(x + 1, y) - I(x - 1, y)) / 2. Pixels on edges get little weight, so edges are not
 * smoothed across. The steps repeat.
 *
 * A step reads two pixels around each pixel, one for the gradient and one for the mean. The
 * plane is extended once by two pixels per step with the border mode, as for anisotropic
 * diffusion, so strips and whole images agree.
 */
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const stepsOf = (params: Params) => Math.round(read.number(params, "iterations", 10));
const kOf = (params: Params) => read.number(params, "k", 10);

/** One step on a plane. Positions past the edge repeat the edge, which only touches the frame. */
export function adaptiveSmoothingStep(plane: Plane, k: number): Plane {
  const { width, height, data } = plane;
  const at = (x: number, y: number) =>
    data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
  const weights = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) / 2;
      const gy = (at(x, y + 1) - at(x, y - 1)) / 2;
      weights[y * width + x] = Math.exp(-(gx * gx + gy * gy) / (2 * k * k));
    }
  }
  const w = (x: number, y: number) =>
    weights[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ??
    0;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const weight = w(x + dx, y + dy);
          sum += weight * at(x + dx, y + dy);
          total += weight;
        }
      }
      out.data[y * width + x] = total > 0 ? sum / total : at(x, y);
    }
  }
  return out;
}

export const adaptiveSmoothingFilter: PlaneFilter = {
  id: "adaptive-smoothing",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => 2 * stepsOf(params),
  plane: (input, params, { border }) => {
    const steps = stepsOf(params);
    let plane = padPlane(input, 2 * steps, border);
    for (let t = 0; t < steps; t++) plane = adaptiveSmoothingStep(plane, kOf(params));
    return cropPlane(plane, 2 * steps);
  },
  representation: (params) => ({
    kind: "iterative",
    iterations: stepsOf(params),
    update: `I \\leftarrow \\frac{\\sum_{3 \\times 3} w\\, I}{\\sum_{3 \\times 3} w},\\quad w = e^{-\\frac{|G|^2}{2 \\cdot ${kOf(params)}^2}}`,
    note: "G is the gradient from central differences at each pixel of the 3x3 window. Pixels on edges have a large gradient and get little weight.",
  }),
};
