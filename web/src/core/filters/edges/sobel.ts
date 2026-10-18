/**
 * Sobel gradient. Catalog entry: catalog/filters/edges/sobel.yaml.
 *
 * Gx and Gy come from separable passes with a difference (-1, 0, 1) and a smoothing (1, 2, 1).
 * sobelKernels builds the 3x3 matrices from the same two factors, so the Inspector shows
 * exactly what runs.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type KernelInfo, type Params, type PlaneFilter } from "@/core/filters/types";

/** The derivative factor, applied across the edge. */
export const SOBEL_DIFFERENCE = [-1, 0, 1] as const;
/** The smoothing factor, applied along the edge. */
export const SOBEL_SMOOTHING = [1, 2, 1] as const;

const outer = (column: readonly number[], row: readonly number[]) =>
  column.map((c) => row.map((r) => c * r));

/** K_x and K_y as 3x3 matrices, made from the separable factors. */
export function sobelKernels(): { kx: number[][]; ky: number[][] } {
  return {
    kx: outer(SOBEL_SMOOTHING, SOBEL_DIFFERENCE),
    ky: outer(SOBEL_DIFFERENCE, SOBEL_SMOOTHING),
  };
}

export type SobelOutput = "magnitude" | "gx" | "gy" | "direction";

/** The two gradient planes. Equal to scipy.ndimage.sobel along x and along y. */
export function sobelGradients(input: Plane, border: BorderMode): { gx: Plane; gy: Plane } {
  return {
    gx: correlateSeparable(input, SOBEL_DIFFERENCE, SOBEL_SMOOTHING, border),
    gy: correlateSeparable(input, SOBEL_SMOOTHING, SOBEL_DIFFERENCE, border),
  };
}

/** Combine Gx and Gy into the chosen output. Direction is in degrees from -180 to 180. */
export function sobelCombine(gx: Plane, gy: Plane, output: SobelOutput, norm: "l1" | "l2"): Plane {
  if (output === "gx") return gx;
  if (output === "gy") return gy;
  const out = createPlane(gx.width, gx.height);
  for (let i = 0; i < out.data.length; i++) {
    const x = gx.data[i] ?? 0;
    const y = gy.data[i] ?? 0;
    out.data[i] =
      output === "direction"
        ? (Math.atan2(y, x) * 180) / Math.PI
        : norm === "l1"
          ? Math.abs(x) + Math.abs(y)
          : Math.hypot(x, y);
  }
  return out;
}

export const sobelFilter: PlaneFilter = {
  id: "sobel",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 1,
  plane: (input: Plane, params: Params, context) => {
    const { gx, gy } = sobelGradients(input, context.border);
    return sobelCombine(
      gx,
      gy,
      read.string<SobelOutput>(params, "output", "magnitude"),
      read.string<"l1" | "l2">(params, "norm", "l2"),
    );
  },
  representation: () => {
    const { kx, ky } = sobelKernels();
    const kernels: KernelInfo[] = [
      {
        name: "K_x",
        rows: kx,
        anchor: { x: 1, y: 1 },
        normalized: false,
        separable: { column: [...SOBEL_SMOOTHING], row: [...SOBEL_DIFFERENCE] },
        note: "Horizontal change. A difference along x and a 1, 2, 1 average along y.",
      },
      {
        name: "K_y",
        rows: ky,
        anchor: { x: 1, y: 1 },
        normalized: false,
        separable: { column: [...SOBEL_DIFFERENCE], row: [...SOBEL_SMOOTHING] },
        note: "Vertical change. A difference along y and a 1, 2, 1 average along x.",
      },
    ];
    return { kind: "kernels", kernels };
  },
};
