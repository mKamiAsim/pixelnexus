/**
 * Chroma denoising. Catalog entry: catalog/filters/enhancement/chroma-denoise.yaml.
 *
 * The image is split into luma Y and the color differences Cb and Cr of ITU-R BT.601, as JPEG
 * (JFIF) uses them:
 *
 *   Y = 0.299 R + 0.587 G + 0.114 B,  Cb = 128 + (B - Y) / 1.772,  Cr = 128 + (R - Y) / 1.402.
 *
 * Cb and Cr are smoothed with a Gaussian or a median, Y is kept, and the image is converted back
 * with the exact inverse. The eye sees fine detail mostly in brightness, which is why JPEG may
 * store Cb and Cr at a lower resolution, so smoothing them removes color blotches and keeps the
 * detail. The combination is PixelNexus's own. The median works on whole levels, so Cb and Cr
 * are rounded first for it.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { gaussianKernel1d, gaussianRadius } from "@/core/filters/linear/gaussian";
import { medianPlane } from "@/core/filters/nonlinear/median";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

type Method = "gaussian" | "median";

const methodOf = (params: Params) => read.string<Method>(params, "method", "gaussian");
const sigmaOf = (params: Params) => read.number(params, "sigma", 2);
const sizeOf = (params: Params) => read.number(params, "size", 5);

/** The Gaussian is cut at 3 sigma, as the Gaussian blur filter does by default. */
const TRUNCATE = 3;

export function chromaRadius(params: Params): number {
  return methodOf(params) === "median"
    ? (sizeOf(params) - 1) >> 1
    : gaussianRadius(sigmaOf(params), TRUNCATE);
}

function smooth(plane: Plane, params: Params, border: BorderMode): Plane {
  if (methodOf(params) === "median") {
    const whole = { ...plane, data: plane.data.map((v) => Math.round(v)) };
    return medianPlane(whole, sizeOf(params), border);
  }
  const g = gaussianKernel1d(sigmaOf(params), TRUNCATE);
  return correlateSeparable(plane, g, g, border);
}

export const chromaDenoiseFilter: ColorFilter = {
  id: "chroma-denoise",
  kind: "color",
  radius: chromaRadius,
  color: (planes, params, { border }) => {
    const [r, g, b] = planes;
    const { width, height } = r;
    const n = width * height;
    const y = new Float64Array(n);
    const cb = createPlane(width, height);
    const cr = createPlane(width, height);
    for (let i = 0; i < n; i++) {
      const R = r.data[i] ?? 0;
      const B = b.data[i] ?? 0;
      const Y = 0.299 * R + 0.587 * (g.data[i] ?? 0) + 0.114 * B;
      y[i] = Y;
      cb.data[i] = 128 + (B - Y) / 1.772;
      cr.data[i] = 128 + (R - Y) / 1.402;
    }
    const sb = smooth(cb, params, border);
    const sr = smooth(cr, params, border);
    const outR = createPlane(width, height);
    const outG = createPlane(width, height);
    const outB = createPlane(width, height);
    for (let i = 0; i < n; i++) {
      const Y = y[i] ?? 0;
      const R = Y + 1.402 * ((sr.data[i] ?? 128) - 128);
      const B = Y + 1.772 * ((sb.data[i] ?? 128) - 128);
      outR.data[i] = R;
      outG.data[i] = (Y - 0.299 * R - 0.114 * B) / 0.587;
      outB.data[i] = B;
    }
    return [outR, outG, outB];
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Split luma and chroma",
        formula:
          "Y = 0.299 R + 0.587 G + 0.114 B,\\quad C_b = 128 + \\frac{B - Y}{1.772},\\quad C_r = 128 + \\frac{R - Y}{1.402}",
        note: "ITU-R BT.601 color differences, as in JPEG.",
      },
      methodOf(params) === "median"
        ? {
            name: "Smooth the chroma",
            formula: `C_b' = \\operatorname{median}_{${sizeOf(params)} \\times ${sizeOf(params)}}(C_b),\\quad C_r' = \\operatorname{median}_{${sizeOf(params)} \\times ${sizeOf(params)}}(C_r)`,
            note: "Cb and Cr are rounded to whole levels for the median.",
          }
        : {
            name: "Smooth the chroma",
            formula: `C_b' = G_{${sigmaOf(params)}} * C_b,\\quad C_r' = G_{${sigmaOf(params)}} * C_r`,
            note: "The Gaussian is cut at 3 sigma.",
          },
      {
        name: "Back to RGB",
        formula:
          "R = Y + 1.402 (C_r' - 128),\\quad B = Y + 1.772 (C_b' - 128),\\quad G = \\frac{Y - 0.299 R - 0.114 B}{0.587}",
        note: "Y is kept, so the brightness of every pixel stays the same.",
      },
    ],
  }),
};
