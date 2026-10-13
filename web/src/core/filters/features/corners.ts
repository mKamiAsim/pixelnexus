/**
 * Harris and Shi-Tomasi corner detectors. Catalog entries: catalog/filters/features/harris.yaml
 * and shi-tomasi.yaml.
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
import { correlateSeparable } from "@/core/filters/convolve";
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
