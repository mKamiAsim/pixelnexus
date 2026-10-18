/**
 * Grayscale conversion. Catalog entry: catalog/filters/enhancement/grayscale.yaml.
 *
 * - Luma BT.709 (default): Y' = 0.2126 R' + 0.7152 G' + 0.0722 B' on encoded values.
 * - Luma BT.601: Y' = 0.299 R' + 0.587 G' + 0.114 B' on encoded values, as OpenCV uses.
 * - Luminance: Y = 0.2126 R + 0.7152 G + 0.0722 B on linear values, then encoded back to sRGB.
 */
import { linearToSrgb, srgbToLinear } from "@/core/color/convert";
import { read, type Params, type PixelFilter } from "@/core/filters/types";

export type GrayscaleMethod = "luma709" | "luma601" | "luminance";

export const GRAYSCALE_WEIGHTS: Readonly<
  Record<GrayscaleMethod, readonly [number, number, number]>
> = {
  luma709: [0.2126, 0.7152, 0.0722],
  luma601: [0.299, 0.587, 0.114],
  luminance: [0.2126, 0.7152, 0.0722],
};

const methodOf = (params: Params) => read.string<GrayscaleMethod>(params, "method", "luma709");

/** The gray value of one pixel, before rounding. */
export function grayValue(r: number, g: number, b: number, method: GrayscaleMethod): number {
  const [wr, wg, wb] = GRAYSCALE_WEIGHTS[method];
  if (method === "luminance") {
    return linearToSrgb(wr * srgbToLinear(r) + wg * srgbToLinear(g) + wb * srgbToLinear(b));
  }
  return wr * r + wg * g + wb * b;
}

export const grayscaleFilter: PixelFilter = {
  id: "grayscale",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => {
    const y = grayValue(r, g, b, methodOf(params));
    out[0] = y;
    out[1] = y;
    out[2] = y;
  },
  representation: (params) => {
    const method = methodOf(params);
    const [wr, wg, wb] = GRAYSCALE_WEIGHTS[method];
    return {
      kind: "weights",
      weights: [
        { name: "w_R", value: wr },
        { name: "w_G", value: wg },
        { name: "w_B", value: wb },
      ],
      space: method === "luminance" ? "linear" : "encoded",
    };
  },
};
