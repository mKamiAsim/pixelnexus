/**
 * Gaussian and Laplacian pyramid filtering. Catalog entries:
 * catalog/filters/multiscale/{gaussian-pyramid,laplacian-pyramid}.yaml.
 *
 * The pyramids follow Burt and Adelson. REDUCE filters with the 5-tap kernel
 * w = [1, 4, 6, 4, 1] / 16 (a = 0.375) and keeps every second pixel, starting with the first.
 * A level of n pixels gives ceil(n / 2). EXPAND doubles the size back: an output pixel i is
 * the sum of 2 w(m) times the coarse pixel (i - m) / 2 over the m in -2 .. 2 that make i - m
 * even. Both run along rows, then columns. Positions outside a level follow the border mode on
 * that level.
 *
 * The Gaussian pyramid filter reduces the image a number of times and expands it back, a
 * low-pass image. The Laplacian pyramid filter takes the detail levels L_k = G_k - EXPAND(G_k+1)
 * and adds them back with a gain per level. With all gains 1 the image comes back exactly.
 * Both depend on the position of each pixel in the pyramid grid, so they run on the whole image.
 */
import { borderIndex, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** The kernel of Burt and Adelson with a = 0.375. */
export const PYRAMID_KERNEL = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16] as const;

const sample = (p: Plane, x: number, y: number, border: BorderMode): number => {
  const sx = borderIndex(x, p.width, border);
  const sy = borderIndex(y, p.height, border);
  return sx < 0 || sy < 0 ? 0 : (p.data[sy * p.width + sx] ?? 0);
};

/** Filter with the pyramid kernel and keep every second pixel, along x or y. */
function reduceAxis(p: Plane, axis: "x" | "y", border: BorderMode): Plane {
  const width = axis === "x" ? Math.ceil(p.width / 2) : p.width;
  const height = axis === "y" ? Math.ceil(p.height / 2) : p.height;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let m = -2; m <= 2; m++) {
        const w = PYRAMID_KERNEL[m + 2] ?? 0;
        sum +=
          w * (axis === "x" ? sample(p, 2 * x + m, y, border) : sample(p, x, 2 * y + m, border));
      }
      out.data[y * width + x] = sum;
    }
  }
  return out;
}

/** Interpolate to `size` pixels along x or y with 2 w over the coarse pixels. */
function expandAxis(p: Plane, axis: "x" | "y", size: number, border: BorderMode): Plane {
  const width = axis === "x" ? size : p.width;
  const height = axis === "y" ? size : p.height;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = axis === "x" ? x : y;
      let sum = 0;
      for (let m = -2; m <= 2; m++) {
        if ((i - m) % 2 !== 0) continue;
        const k = (i - m) / 2;
        const w = 2 * (PYRAMID_KERNEL[m + 2] ?? 0);
        sum += w * (axis === "x" ? sample(p, k, y, border) : sample(p, x, k, border));
      }
      out.data[y * width + x] = sum;
    }
  }
  return out;
}

export function reduce(p: Plane, border: BorderMode): Plane {
  return reduceAxis(reduceAxis(p, "x", border), "y", border);
}

export function expand(p: Plane, width: number, height: number, border: BorderMode): Plane {
  return expandAxis(expandAxis(p, "x", width, border), "y", height, border);
}

/** The Gaussian pyramid G_0 .. G_levels, stopping early when a level is one pixel. */
export function gaussianPyramid(input: Plane, levels: number, border: BorderMode): Plane[] {
  const pyramid = [input];
  for (let k = 0; k < levels; k++) {
    const top = pyramid[pyramid.length - 1] ?? input;
    if (top.width === 1 && top.height === 1) break;
    pyramid.push(reduce(top, border));
  }
  return pyramid;
}

const subtract = (a: Plane, b: Plane): Plane => ({
  ...a,
  data: a.data.map((v, i) => v - (b.data[i] ?? 0)),
});

/**
 * Rebuild an image from its Gaussian pyramid, with gain gains[k] on the detail level L_k. Gains
 * that are not given are 1.
 */
export function laplacianRebuild(
  pyramid: Plane[],
  gains: readonly number[],
  border: BorderMode,
): Plane {
  let estimate = pyramid[pyramid.length - 1] ?? createPlane(1, 1);
  for (let k = pyramid.length - 2; k >= 0; k--) {
    const level = pyramid[k] ?? estimate;
    const expanded = expand(pyramid[k + 1] ?? estimate, level.width, level.height, border);
    const detail = subtract(level, expanded);
    const up = expand(estimate, level.width, level.height, border);
    const gain = gains[k] ?? 1;
    estimate = { ...up, data: up.data.map((v, i) => v + gain * (detail.data[i] ?? 0)) };
  }
  return estimate;
}

const levelsOf = (params: Params) => read.number(params, "levels", 2);

export const gaussianPyramidFilter: PlaneFilter = {
  id: "gaussian-pyramid",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) => {
    const pyramid = gaussianPyramid(input, levelsOf(params), border);
    let estimate = pyramid[pyramid.length - 1] ?? input;
    for (let k = pyramid.length - 2; k >= 0; k--) {
      const level = pyramid[k] ?? input;
      estimate = expand(estimate, level.width, level.height, border);
    }
    return estimate;
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Reduce",
        formula: `G_{k+1} = \\operatorname{REDUCE}(G_k),\\quad k = 0 \\ldots ${levelsOf(params) - 1}`,
        note: "Filter with w = [1 4 6 4 1] / 16 along rows and columns, and keep every second pixel.",
      },
      {
        name: "Expand",
        formula: `\\hat{I} = \\operatorname{EXPAND}^{${levelsOf(params)}}(G_{${levelsOf(params)}})`,
        note: "Each EXPAND doubles the size, with weights 2 w on the coarse pixels.",
      },
    ],
    note: "The result is the image as level k of the pyramid sees it, at full size.",
  }),
};

const GAIN_KEYS = ["gain1", "gain2", "gain3", "gain4"] as const;
const gainsOf = (params: Params) => GAIN_KEYS.map((key) => read.number(params, key, 1));

export const laplacianPyramidFilter: PlaneFilter = {
  id: "laplacian-pyramid",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    laplacianRebuild(
      gaussianPyramid(input, read.number(params, "levels", 4), border),
      gainsOf(params),
      border,
    ),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Gaussian pyramid",
        formula: "G_{k+1} = \\operatorname{REDUCE}(G_k)",
        note: "Filter with w = [1 4 6 4 1] / 16 and keep every second pixel.",
      },
      {
        name: "Detail levels",
        formula: "L_k = G_k - \\operatorname{EXPAND}(G_{k+1})",
      },
      {
        name: "Rebuild",
        formula: `\\hat{G}_k = \\operatorname{EXPAND}(\\hat{G}_{k+1}) + a_k L_k,\\quad (a_0, a_1, a_2, a_3) = (${gainsOf(params).join(",\\ ")})`,
        note: "The top level is kept. With all gains 1 the image comes back exactly.",
      },
    ],
  }),
};
