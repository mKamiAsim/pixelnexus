/**
 * Corner detectors: Harris, Shi-Tomasi, Moravec and FAST. Catalog entries in
 * catalog/filters/features/: harris.yaml, shi-tomasi.yaml, moravec.yaml and fast.yaml.
 *
 * Both read the image on a 0 to 1 scale and build the structure tensor as
 * skimage.feature.structure_tensor does: Sobel derivatives Ix and Iy, then a Gaussian of sigma,
 * cut at 4 sigma, over Ix^2, Ix Iy and Iy^2. Harris gives det(A) - k trace(A)^2, and Shi-Tomasi
 * the smaller eigenvalue of A. The corners output marks pixels whose response is at least the
 * threshold and at least every response within the minimum distance, so plateaus keep every
 * pixel.
 *
 * The plane is extended once by the full support with the border mode. The stages run on the
 * extended plane with replicated edges, and the frame is cut off, so strips and whole images
 * agree. scikit-image applies its border rule at every stage instead, so the two agree away
 * from the border.
 */
import { boxMean, correlateSeparable } from "@/core/filters/convolve";
import { SOBEL_DIFFERENCE, SOBEL_SMOOTHING } from "@/core/filters/edges/sobel";
import { gaussianPlane, gaussianRadius } from "@/core/filters/linear/gaussian";
import { extremePlane } from "@/core/filters/nonlinear/window";
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const TRUNCATE = 4;

export type CornerMeasure = "harris" | "shi-tomasi";

/** The corner response of a plane, on its own size. Positions past the edge repeat the edge. */
export function cornerResponse(
  input: Plane,
  sigma: number,
  measure: CornerMeasure,
  k: number,
): Plane {
  const scaled = createPlane(input.width, input.height);
  for (let i = 0; i < scaled.data.length; i++) scaled.data[i] = (input.data[i] ?? 0) / 255;
  const ix = correlateSeparable(scaled, SOBEL_DIFFERENCE, SOBEL_SMOOTHING, "replicate");
  const iy = correlateSeparable(scaled, SOBEL_SMOOTHING, SOBEL_DIFFERENCE, "replicate");
  const product = (a: Plane, b: Plane) => {
    const out = createPlane(a.width, a.height);
    for (let i = 0; i < out.data.length; i++) out.data[i] = (a.data[i] ?? 0) * (b.data[i] ?? 0);
    return gaussianPlane(out, sigma, TRUNCATE, "replicate");
  };
  const axx = product(ix, ix);
  const axy = product(ix, iy);
  const ayy = product(iy, iy);
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < out.data.length; i++) {
    const a = axx.data[i] ?? 0;
    const b = axy.data[i] ?? 0;
    const c = ayy.data[i] ?? 0;
    out.data[i] =
      measure === "harris"
        ? a * c - b * b - k * (a + c) ** 2
        : (a + c - Math.sqrt((a - c) ** 2 + 4 * b * b)) / 2;
  }
  return out;
}

/** 255 where the response is at least the threshold and the largest within the distance. */
export function cornerPeaks(response: Plane, distance: number, threshold: number): Plane {
  const largest = extremePlane(response, distance, "replicate", "max");
  const out = createPlane(response.width, response.height);
  for (let i = 0; i < out.data.length; i++) {
    const v = response.data[i] ?? 0;
    if (v >= threshold && v >= (largest.data[i] ?? 0)) out.data[i] = 255;
  }
  return out;
}

const sigmaOf = (params: Params) => read.number(params, "sigma", 1);
const distanceOf = (params: Params) => Math.max(1, Math.round(read.number(params, "distance", 3)));
const cornersWanted = (params: Params) =>
  read.string<"response" | "corners">(params, "output", "response") === "corners";
const reachOf = (params: Params) =>
  1 + gaussianRadius(sigmaOf(params), TRUNCATE) + (cornersWanted(params) ? distanceOf(params) : 0);

function cornerFilter(measure: CornerMeasure): PlaneFilter {
  const kOf = (params: Params) => (measure === "harris" ? read.number(params, "k", 0.05) : 0);
  return {
    id: measure,
    kind: "derived",
    alphaWeighted: false,
    radius: reachOf,
    plane: (input, params, { border }) => {
      const reach = reachOf(params);
      const response = cornerResponse(
        padPlane(input, reach, border),
        sigmaOf(params),
        measure,
        kOf(params),
      );
      const result = cornersWanted(params)
        ? cornerPeaks(response, distanceOf(params), read.number(params, "threshold", 0.01))
        : response;
      return cropPlane(result, reach);
    },
    representation: (params) => ({
      kind: "stages",
      stages: [
        {
          name: "Derivatives",
          formula: "I_x = S_x \\star \\tfrac{I}{255},\\quad I_y = S_y \\star \\tfrac{I}{255}",
          note: "S_x and S_y are the Sobel kernels, shown on the Sobel page.",
        },
        {
          name: "Structure tensor",
          formula: `A = G_{${sigmaOf(params)}} * \\begin{pmatrix} I_x^2 & I_x I_y \\\\ I_x I_y & I_y^2 \\end{pmatrix}`,
          note: `Each entry is blurred with a Gaussian of sigma ${sigmaOf(params)}, cut at ${TRUNCATE} sigma.`,
        },
        {
          name: "Response",
          formula:
            measure === "harris"
              ? `R = \\det A - ${kOf(params)}\\,(\\operatorname{tr} A)^2`
              : "R = \\lambda_{\\min}(A) = \\tfrac{1}{2}\\left(\\operatorname{tr} A - \\sqrt{(A_{xx} - A_{yy})^2 + 4 A_{xy}^2}\\right)",
        },
        ...(cornersWanted(params)
          ? [
              {
                name: "Corners",
                formula: `R(p) \\ge ${read.number(params, "threshold", 0.01)} \\text{ and } R(p) = \\max_{|q - p|_\\infty \\le ${distanceOf(params)}} R(q)`,
                note: "Corners become 255 and everything else 0.",
              },
            ]
          : []),
      ],
    }),
  };
}

export const harrisFilter: PlaneFilter = { ...cornerFilter("harris"), id: "harris" };
export const shiTomasiFilter: PlaneFilter = { ...cornerFilter("shi-tomasi"), id: "shi-tomasi" };

/** Moravec compares a window with the window moved one pixel in these four directions. */
const MORAVEC_SHIFTS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
] as const;

/**
 * The Moravec response on a 0 to 1 scale: the smallest sum of squared differences between the
 * window around a pixel and the window moved by one of the four shifts. Positions past the edge
 * repeat the edge.
 */
export function moravecResponse(input: Plane, half: number): Plane {
  const { width, height } = input;
  const at = (x: number, y: number) =>
    (input.data[
      Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))
    ] ?? 0) / 255;
  const size = 2 * half + 1;
  const out = createPlane(width, height, Infinity);
  for (const [dx, dy] of MORAVEC_SHIFTS) {
    const squared = createPlane(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        squared.data[y * width + x] = (at(x, y) - at(x + dx, y + dy)) ** 2;
      }
    }
    const sums = boxMean(squared, size, "replicate");
    for (let i = 0; i < out.data.length; i++) {
      out.data[i] = Math.min(out.data[i] ?? 0, (sums.data[i] ?? 0) * size * size);
    }
  }
  return out;
}

/** The FAST circle of 16 pixels at radius 3, in order around it. */
export const FAST_CIRCLE = [
  [0, -3],
  [1, -3],
  [2, -2],
  [3, -1],
  [3, 0],
  [3, 1],
  [2, 2],
  [1, 3],
  [0, 3],
  [-1, 3],
  [-2, 2],
  [-3, 1],
  [-3, 0],
  [-3, -1],
  [-2, -2],
  [-1, -3],
] as const;

/** True when at least n flags in a row are set, going around the circle. */
function hasRun(flags: readonly boolean[], n: number): boolean {
  let run = 0;
  for (let k = 0; k < 2 * flags.length; k++) {
    run = flags[k % flags.length] ? run + 1 : 0;
    if (run >= n) return true;
  }
  return false;
}

/**
 * The FAST score on a 0 to 1 scale. A pixel p is a corner when at least n circle pixels in a
 * row are all brighter than I_p + t or all darker than I_p - t. Its score is the larger of the
 * sums of |I - I_p| - t over the brighter and over the darker circle pixels. Other pixels score
 * 0. Positions past the edge repeat the edge.
 */
export function fastScore(input: Plane, n: number, t: number): Plane {
  const { width, height } = input;
  const at = (x: number, y: number) =>
    (input.data[
      Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))
    ] ?? 0) / 255;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = at(x, y);
      const ring = FAST_CIRCLE.map(([dx, dy]) => at(x + dx, y + dy));
      const bright = ring.map((v) => v > p + t);
      const dark = ring.map((v) => v < p - t);
      if (!hasRun(bright, n) && !hasRun(dark, n)) continue;
      let up = 0;
      let down = 0;
      ring.forEach((v, k) => {
        if (bright[k]) up += v - p - t;
        if (dark[k]) down += p - v - t;
      });
      out.data[y * width + x] = Math.max(up, down);
    }
  }
  return out;
}

function pointFilter(
  measure: "moravec" | "fast",
  reach: (params: Params) => number,
  score: (input: Plane, params: Params) => Plane,
  stages: (params: Params) => { name: string; formula: string; note?: string }[],
): PlaneFilter {
  const total = (params: Params) =>
    reach(params) + (cornersWanted(params) ? distanceOf(params) : 0);
  return {
    id: measure,
    kind: "derived",
    alphaWeighted: false,
    radius: total,
    plane: (input, params, { border }) => {
      const r = total(params);
      const values = score(padPlane(input, r, border), params);
      const threshold =
        measure === "fast" ? Number.MIN_VALUE : read.number(params, "threshold", 0.1);
      const result = cornersWanted(params)
        ? cornerPeaks(values, distanceOf(params), threshold)
        : values;
      return cropPlane(result, r);
    },
    representation: (params) => ({
      kind: "stages",
      stages: [
        ...stages(params),
        ...(cornersWanted(params)
          ? [
              {
                name: "Corners",
                formula: `R(p) ${measure === "fast" ? "> 0" : `\\ge ${read.number(params, "threshold", 0.1)}`} \\text{ and } R(p) = \\max_{|q - p|_\\infty \\le ${distanceOf(params)}} R(q)`,
                note: "Corners become 255 and everything else 0.",
              },
            ]
          : []),
      ],
    }),
  };
}

const halfOf = (params: Params) => Math.max(1, Math.round(read.number(params, "window", 1)));

export const moravecFilter: PlaneFilter = {
  ...pointFilter(
    "moravec",
    (params) => halfOf(params) + 1,
    (input, params) => moravecResponse(input, halfOf(params)),
    (params) => [
      {
        name: "Shifted differences",
        formula: `E_s(p) = \\sum_{|q|_\\infty \\le ${halfOf(params)}} \\left(I(p + q) - I(p + q + s)\\right)^2`,
        note: "For the shifts s = (1, 0), (1, 1), (0, 1) and (-1, 1), on a 0 to 1 scale.",
      },
      { name: "Response", formula: "R(p) = \\min_s E_s(p)" },
    ],
  ),
  id: "moravec",
};

const nOf = (params: Params) => Math.round(read.number(params, "n", 9));
const tOf = (params: Params) => read.number(params, "threshold", 0.15);

export const fastFilter: PlaneFilter = {
  ...pointFilter(
    "fast",
    () => 3,
    (input, params) => fastScore(input, nOf(params), tOf(params)),
    (params) => [
      {
        name: "Segment test",
        formula: `\\exists\\, ${nOf(params)} \\text{ circle pixels in a row with } I > I_p + ${tOf(params)} \\text{ or } I < I_p - ${tOf(params)}`,
        note: "The circle has 16 pixels at radius 3. Values are on a 0 to 1 scale.",
      },
      {
        name: "Score",
        formula: `R(p) = \\max\\left(\\sum_{\\text{brighter}} \\left(I - I_p - ${tOf(params)}\\right),\\ \\sum_{\\text{darker}} \\left(I_p - I - ${tOf(params)}\\right)\\right)`,
        note: "Pixels that fail the segment test score 0.",
      },
    ],
  ),
  id: "fast",
};
