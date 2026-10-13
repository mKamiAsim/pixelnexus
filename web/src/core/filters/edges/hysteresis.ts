/**
 * Hysteresis thresholding and the Canny edge detector. Catalog entries:
 * catalog/filters/edges/hysteresis.yaml and canny.yaml.
 *
 * Hysteresis keeps every pixel at or above the high threshold, plus every pixel at or above the
 * low threshold that is joined to such a pixel by a path of pixels at or above the low
 * threshold. If the high threshold is below the low one, it is raised to the low one. A path can
 * cross the whole image, so both filters are global: they always run on the whole image.
 *
 * Canny runs five stages: a Gaussian blur, the Sobel gradient, non-maximum suppression along
 * the gradient, the double threshold and hysteresis with eight neighbors. It extends the plane
 * by the support of the first three stages with the border mode. Those stages run on the
 * extended plane, and the last two run on the image itself, so edges never connect through the
 * extension.
 */
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import { gaussianPlane, gaussianRadius } from "@/core/filters/linear/gaussian";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { suppress } from "./nms";
import { sobelCombine, sobelGradients } from "./sobel";

const FOUR = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const EIGHT = [...FOUR, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** 255 for the pixels hysteresis keeps, 0 elsewhere. */
export function hysteresis(values: Plane, low: number, high: number, connectivity: 4 | 8): Plane {
  const { width, height, data } = values;
  const top = Math.max(low, high);
  const out = createPlane(width, height);
  const stack: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if ((data[i] ?? 0) >= top) {
      out.data[i] = 255;
      stack.push(i);
    }
  }
  const steps = connectivity === 4 ? FOUR : EIGHT;
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of steps) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (out.data[j] === 0 && (data[j] ?? 0) >= low) {
        out.data[j] = 255;
        stack.push(j);
      }
    }
  }
  return out;
}

/** 255 at or above the high threshold, 128 at or above the low one, 0 elsewhere. */
export function doubleThreshold(values: Plane, low: number, high: number): Plane {
  const top = Math.max(low, high);
  const out = createPlane(values.width, values.height);
  values.data.forEach((v, i) => {
    out.data[i] = v >= top ? 255 : v >= low ? 128 : 0;
  });
  return out;
}

const lowOf = (params: Params, fallback: number) => read.number(params, "low", fallback);
const highOf = (params: Params, fallback: number) => read.number(params, "high", fallback);
const connectivityOf = (params: Params) =>
  read.string<"4" | "8">(params, "connectivity", "8") === "4" ? 4 : 8;

function hysteresisStages(low: number, high: number, connectivity: number) {
  return [
    { name: "Strong pixels", formula: `S = \\{\\, p : v(p) \\ge ${Math.max(low, high)} \\,\\}` },
    { name: "Weak pixels", formula: `W = \\{\\, p : v(p) \\ge ${low} \\,\\}` },
    {
      name: "Edges",
      formula: "E = \\{\\, p \\in W : \\text{a path in } W \\text{ joins } p \\text{ to } S \\,\\}",
      note: `A path steps between ${connectivity} neighbors.`,
    },
  ];
}

export const hysteresisFilter: PlaneFilter = {
  id: "hysteresis",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params) =>
    hysteresis(input, lowOf(params, 50), highOf(params, 100), connectivityOf(params)),
  representation: (params) => ({
    kind: "stages",
    stages: hysteresisStages(lowOf(params, 50), highOf(params, 100), connectivityOf(params)),
    note: "The result is 255 on the edges and 0 elsewhere.",
  }),
};

export type CannyStage = "smoothed" | "magnitude" | "suppressed" | "thresholds" | "edges";

/** The Gaussian of Canny is truncated at 4 sigma, as in scipy.ndimage.gaussian_filter. */
const TRUNCATE = 4;
const sigmaOf = (params: Params) => read.number(params, "sigma", 1.5);
const normOf = (params: Params) => read.string<"l1" | "l2">(params, "norm", "l2");
/** The support of the blur, Sobel and the suppression together. */
const cannyReach = (params: Params) => gaussianRadius(sigmaOf(params), TRUNCATE) + 2;

/**
 * One stage of Canny on a plane that is already extended by `reach` pixels. The result has the
 * same size as the input. Positions past the extended plane repeat its edge.
 */
export function cannyStage(
  input: Plane,
  reach: number,
  stage: CannyStage,
  sigma: number,
  norm: "l1" | "l2",
  low: number,
  high: number,
): Plane {
  const smoothed = gaussianPlane(input, sigma, TRUNCATE, "replicate");
  if (stage === "smoothed") return smoothed;
  const { gx, gy } = sobelGradients(smoothed, "replicate");
  const magnitude = sobelCombine(gx, gy, "magnitude", norm);
  if (stage === "magnitude") return magnitude;
  const suppressed = suppress(gx, gy, magnitude);
  if (stage === "suppressed") return suppressed;
  const inner = cropPlane(suppressed, reach);
  const result =
    stage === "thresholds" ? doubleThreshold(inner, low, high) : hysteresis(inner, low, high, 8);
  return padPlane(result, reach, "constant");
}

export const cannyFilter: PlaneFilter = {
  id: "canny",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) => {
    const reach = cannyReach(params);
    const stage = cannyStage(
      padPlane(input, reach, border),
      reach,
      read.string<CannyStage>(params, "stage", "edges"),
      sigmaOf(params),
      normOf(params),
      lowOf(params, 40),
      highOf(params, 100),
    );
    return cropPlane(stage, reach);
  },
  representation: (params) => {
    const sigma = sigmaOf(params);
    const low = lowOf(params, 40);
    const high = highOf(params, 100);
    const magnitude = normOf(params) === "l1" ? "M = |G_x| + |G_y|" : "M = \\sqrt{G_x^2 + G_y^2}";
    return {
      kind: "stages",
      stages: [
        {
          name: "Smooth",
          formula: `I_s = G_{${sigma}} * I`,
          note: `A Gaussian with sigma ${sigma}, cut at ${TRUNCATE} sigma.`,
        },
        {
          name: "Gradient",
          formula: `G_x = S_x * I_s,\\quad G_y = S_y * I_s,\\quad ${magnitude}`,
          note: "S_x and S_y are the Sobel kernels, shown on the Sobel page.",
        },
        {
          name: "Thin",
          formula: "N(p) = M(p) \\text{ if } M(p) \\ge M(p \\pm d_{\\theta}) \\text{ else } 0",
          note: "Non-maximum suppression along the gradient, rounded to four directions.",
        },
        {
          name: "Double threshold",
          formula: `S = \\{\\, p : N(p) \\ge ${Math.max(low, high)} \\,\\},\\quad W = \\{\\, p : N(p) \\ge ${low} \\,\\}`,
          note: "S holds the strong pixels and W the weak ones.",
        },
        {
          name: "Hysteresis",
          formula:
            "E = \\{\\, p \\in W : \\text{a path in } W \\text{ joins } p \\text{ to } S \\,\\}",
          note: "A path steps between 8 neighbors. The result is 255 on the edges and 0 elsewhere.",
        },
      ],
      note: "The first three stages see the image extended with the border mode. The last two see only the image.",
    };
  },
};
