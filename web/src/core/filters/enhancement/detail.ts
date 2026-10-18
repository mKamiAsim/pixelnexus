/**
 * Detail enhancement. Catalog entry: catalog/filters/enhancement/detail-enhance.yaml.
 *
 * As described by He, Sun and Tang ("Guided image filtering", 2013, section 3.4): an
 * edge-preserving smoothing of the input p is the base layer q, the difference d = p - q is the
 * detail layer, and the detail is boosted: out = q + k d. Their example uses k = 5, a guided
 * filter with r = 16 and eps = 0.1^2, or a bilateral filter with sigma_s = 16 and sigma_r = 0.1
 * (on values from 0 to 1).
 *
 * The guided base is the guided filter of guided.ts, on the plane extended by 2r with the border
 * mode. The bilateral base is the piecewise-linear bilateral filter of Durand and Dorsey from
 * tonemap.ts, whose cost does not grow with sigma_s, on the image mirrored at its edges. It is
 * global for that reason: the Gaussian runs through the FFT of whole rows and columns.
 */
import {
  createPlane,
  cropPlane,
  padPlane,
  type BorderMode,
  type Plane,
} from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";
import { guidedPlane } from "@/core/filters/nonlinear/guided";

import { piecewiseBilateral } from "./tonemap";

type Base = "guided" | "bilateral";

export interface DetailSettings {
  readonly base: Base;
  readonly boost: number;
  readonly radius: number;
  readonly eps: number;
  readonly sigmaSpace: number;
  readonly sigmaRange: number;
  readonly downsample: number;
}

export const detailSettings = (params: Params): DetailSettings => ({
  base: read.string<Base>(params, "base", "guided"),
  boost: read.number(params, "boost", 5),
  radius: read.number(params, "radius", 16),
  eps: read.number(params, "eps", 0.01),
  sigmaSpace: read.number(params, "sigmaSpace", 16),
  sigmaRange: read.number(params, "sigmaRange", 25.5),
  downsample: Math.max(1, Math.round(read.number(params, "downsample", 1))),
});

/** The base layer: an edge-preserving smoothing of the plane. */
export function detailBase(input: Plane, s: DetailSettings, border: BorderMode): Plane {
  if (s.base === "bilateral") {
    const values = piecewiseBilateral(
      Float64Array.from(input.data),
      input.width,
      input.height,
      s.sigmaSpace,
      s.sigmaRange,
      s.downsample,
    );
    const out = createPlane(input.width, input.height);
    out.data.set(values);
    return out;
  }
  const padded = padPlane(input, 2 * s.radius, border);
  return cropPlane(
    guidedPlane(padded, padded, s.radius, s.eps * 255 * 255, "replicate"),
    2 * s.radius,
  );
}

export const detailEnhanceFilter: PlaneFilter = {
  id: "detail-enhance",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) => {
    const s = detailSettings(params);
    const base = detailBase(input, s, border);
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) {
      const q = base.data[i] ?? 0;
      out.data[i] = q + s.boost * ((input.data[i] ?? 0) - q);
    }
    return out;
  },
  representation: (params) => {
    const s = detailSettings(params);
    return {
      kind: "stages",
      stages: [
        s.base === "guided"
          ? {
              name: "Base layer",
              formula: `q = \\operatorname{guided}(p),\\quad r = ${s.radius},\\ \\varepsilon = ${s.eps}`,
              note: "The guided filter with the input as its own guide.",
            }
          : {
              name: "Base layer",
              formula: `q = \\operatorname{bilateral}(p),\\quad \\sigma_s = ${s.sigmaSpace},\\ \\sigma_r = ${s.sigmaRange}`,
              note: `Durand and Dorsey's piecewise-linear bilateral filter, on every ${s.downsample === 1 ? "" : `${s.downsample}th `}pixel.`,
            },
        { name: "Detail layer", formula: "d = p - q" },
        { name: "Boost", formula: `p' = q + ${s.boost}\\, d` },
      ],
    };
  },
};
