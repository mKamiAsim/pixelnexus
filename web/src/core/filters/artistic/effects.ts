/**
 * Vignette and pixelate. Catalog entries: catalog/filters/artistic/{vignette,pixelate}.yaml.
 *
 * - Vignette darkens toward the corners. The factor is 1 - a s(d), where d is the distance from
 *   the center scaled so that the corners are at 1 (an ellipse with the shape of the image), and
 *   s is the smoothstep t^2 (3 - 2 t) of t = (d - d0) / (1 - d0), clamped to 0..1. This falloff is
 *   PixelNexus's own. By default the factor scales linear light, as a lens's falloff does.
 * - Pixelate replaces each n x n block, counted from the top-left corner of the image, by its
 *   mean. Blocks at the right and bottom edges may be smaller; they average the pixels they have.
 *
 * Both depend on the position in the whole image, so they are global filters.
 */
import { linearToSrgb, srgbToLinear } from "@/core/color/convert";
import { createPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

export interface VignetteSettings {
  readonly amount: number;
  readonly start: number;
  readonly linearLight: boolean;
}

export const vignetteSettings = (params: Params): VignetteSettings => ({
  amount: read.number(params, "amount", 50) / 100,
  start: read.number(params, "start", 50) / 100,
  linearLight: read.boolean(params, "linearLight", true),
});

/** The vignette factor at pixel (x, y) of a width x height image. */
export function vignetteFactor(
  x: number,
  y: number,
  width: number,
  height: number,
  s: VignetteSettings,
): number {
  const u = (x + 0.5 - width / 2) / (width / 2);
  const v = (y + 0.5 - height / 2) / (height / 2);
  const d = Math.sqrt((u * u + v * v) / 2);
  const t = s.start >= 1 ? 0 : Math.min(1, Math.max(0, (d - s.start) / (1 - s.start)));
  return 1 - s.amount * t * t * (3 - 2 * t);
}

export const vignetteFilter: PlaneFilter = {
  id: "vignette",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params) => {
    const s = vignetteSettings(params);
    const { width, height } = input;
    const out = createPlane(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const f = vignetteFactor(x, y, width, height, s);
        const v = input.data[i] ?? 0;
        out.data[i] = s.linearLight ? linearToSrgb(f * srgbToLinear(v)) : f * v;
      }
    }
    return out;
  },
  representation: (params) => {
    const s = vignetteSettings(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Distance",
          formula:
            "d = \\sqrt{\\tfrac{1}{2}\\left(\\left(\\tfrac{x - c_x}{W/2}\\right)^2 + \\left(\\tfrac{y - c_y}{H/2}\\right)^2\\right)}",
          note: "0 at the center and 1 at the corners.",
        },
        {
          name: "Falloff",
          formula: `f = 1 - ${s.amount}\\, t^2 (3 - 2t),\\quad t = \\operatorname{clamp}\\left(\\frac{d - ${s.start}}{1 - ${s.start}}\\right)`,
          note: s.linearLight ? "f scales linear light values." : "f scales the encoded values.",
        },
      ],
    };
  },
};

const sizeOf = (params: Params) => Math.max(1, Math.round(read.number(params, "size", 8)));

export function pixelatePlane(input: Plane, n: number): Plane {
  const { width, height } = input;
  const out = createPlane(width, height);
  for (let by = 0; by < height; by += n) {
    for (let bx = 0; bx < width; bx += n) {
      const y1 = Math.min(by + n, height);
      const x1 = Math.min(bx + n, width);
      let sum = 0;
      for (let y = by; y < y1; y++)
        for (let x = bx; x < x1; x++) sum += input.data[y * width + x] ?? 0;
      const mean = sum / ((y1 - by) * (x1 - bx));
      for (let y = by; y < y1; y++) out.data.fill(mean, y * width + bx, y * width + x1);
    }
  }
  return out;
}

export const pixelateFilter: PlaneFilter = {
  id: "pixelate",
  kind: "smooth",
  alphaWeighted: true,
  global: true,
  radius: () => 0,
  plane: (input, params) => pixelatePlane(input, sizeOf(params)),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Block mean",
        formula: `I_{\\text{out}}(p) = \\operatorname{mean}_{B(p)} I,\\quad B(p) = \\text{the } ${sizeOf(params)} \\times ${sizeOf(params)} \\text{ block of } p`,
        note: "Blocks are counted from the top-left corner of the image. Blocks at the right and bottom edges may be smaller.",
      },
    ],
  }),
};
