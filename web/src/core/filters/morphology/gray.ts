/**
 * Grayscale morphology with a flat structuring element B. Catalog entries in
 * catalog/filters/morphology/: erosion, dilation, opening, closing, the three gradients, top-hat
 * and black-hat.
 *
 *   erosion   (f - B)(p) = min over z in B of f(p + z)
 *   dilation  (f + B)(p) = max over z in B of f(p - z)
 *
 * Dilation uses the element turned by 180 degrees, so erosion and dilation are dual and match
 * scipy.ndimage.grey_erosion and grey_dilation. On a binary image of 0 and 255 they are binary
 * erosion and dilation. With n iterations, each step runs n times: opening is n erosions and
 * then n dilations.
 *
 * Every filter extends the plane once by its full reach with the border mode, runs its steps
 * with replicated edges and cuts the frame off, so strips and whole images agree.
 */
import {
  borderTable,
  createPlane,
  cropPlane,
  padPlane,
  type BorderMode,
  type Plane,
} from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import {
  elementOf,
  elementOffsets,
  elementReach,
  reflectElement,
  type StructuringElement,
} from "./structuring";

/** The smallest (erosion) or largest (dilation) value over the element. */
function extreme(
  input: Plane,
  element: StructuringElement,
  border: BorderMode,
  kind: "min" | "max",
): Plane {
  const { width, height, data } = input;
  const used = kind === "min" ? element : reflectElement(element);
  const offsets = elementOffsets(used);
  const pad = elementReach(used);
  const xs = borderTable(width, pad, border);
  const ys = borderTable(height, pad, border);
  const out = createPlane(width, height);
  const outside = kind === "min" ? Infinity : -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = outside;
      for (const [dx, dy] of offsets) {
        const sx = xs[x + dx + pad] ?? -1;
        const sy = ys[y + dy + pad] ?? -1;
        const v = sx < 0 || sy < 0 ? 0 : (data[sy * width + sx] ?? 0);
        best = kind === "min" ? Math.min(best, v) : Math.max(best, v);
      }
      out.data[y * width + x] = best;
    }
  }
  return out;
}

export const erodePlane = (input: Plane, element: StructuringElement, border: BorderMode) =>
  extreme(input, element, border, "min");
export const dilatePlane = (input: Plane, element: StructuringElement, border: BorderMode) =>
  extreme(input, element, border, "max");

function repeat(input: Plane, n: number, step: (p: Plane) => Plane): Plane {
  let out = input;
  for (let i = 0; i < n; i++) out = step(out);
  return out;
}

function subtract(a: Plane, b: Plane): Plane {
  const out = createPlane(a.width, a.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = (a.data[i] ?? 0) - (b.data[i] ?? 0);
  return out;
}

export type MorphologyOperation =
  | "erosion"
  | "dilation"
  | "opening"
  | "closing"
  | "morph-gradient"
  | "internal-gradient"
  | "external-gradient"
  | "tophat"
  | "blackhat";

/** How many single steps away the operation reaches, in units of the element reach. */
const DEPTH: Record<MorphologyOperation, number> = {
  erosion: 1,
  dilation: 1,
  opening: 2,
  closing: 2,
  "morph-gradient": 1,
  "internal-gradient": 1,
  "external-gradient": 1,
  tophat: 2,
  blackhat: 2,
};

/** The operation on a plane that is already extended. Positions past the edge repeat the edge. */
export function morphology(
  input: Plane,
  operation: MorphologyOperation,
  element: StructuringElement,
  iterations: number,
): Plane {
  const erode = (p: Plane) => repeat(p, iterations, (q) => erodePlane(q, element, "replicate"));
  const dilate = (p: Plane) => repeat(p, iterations, (q) => dilatePlane(q, element, "replicate"));
  switch (operation) {
    case "erosion":
      return erode(input);
    case "dilation":
      return dilate(input);
    case "opening":
      return dilate(erode(input));
    case "closing":
      return erode(dilate(input));
    case "morph-gradient":
      return subtract(dilate(input), erode(input));
    case "internal-gradient":
      return subtract(input, erode(input));
    case "external-gradient":
      return subtract(dilate(input), input);
    case "tophat":
      return subtract(input, dilate(erode(input)));
    case "blackhat":
      return subtract(erode(dilate(input)), input);
  }
}

export const elementParam = (params: Params) => elementOf(read.string(params, "element", "disk 1"));
export const iterationsOf = (params: Params) =>
  Math.max(1, Math.round(read.number(params, "iterations", 1)));

const FORMULAS: Record<MorphologyOperation, string> = {
  erosion: "(f \\ominus B)(p) = \\min_{z \\in B} f(p + z)",
  dilation: "(f \\oplus B)(p) = \\max_{z \\in B} f(p - z)",
  opening: "f \\circ B = (f \\ominus B) \\oplus B",
  closing: "f \\bullet B = (f \\oplus B) \\ominus B",
  "morph-gradient": "(f \\oplus B) - (f \\ominus B)",
  "internal-gradient": "f - (f \\ominus B)",
  "external-gradient": "(f \\oplus B) - f",
  tophat: "f - (f \\circ B)",
  blackhat: "(f \\bullet B) - f",
};

const STATISTIC: Partial<Record<MorphologyOperation, "min" | "max" | "range">> = {
  erosion: "min",
  dilation: "max",
  "morph-gradient": "range",
};

function morphologyFilter(operation: MorphologyOperation): PlaneFilter {
  const reach = (params: Params) =>
    DEPTH[operation] * iterationsOf(params) * elementReach(elementParam(params));
  return {
    id: operation,
    kind: "smooth",
    alphaWeighted: false,
    radius: reach,
    plane: (input, params, { border }) => {
      const r = reach(params);
      const result = morphology(
        padPlane(input, r, border),
        operation,
        elementParam(params),
        iterationsOf(params),
      );
      return cropPlane(result, r);
    },
    representation: (params) => {
      const element = elementParam(params);
      const shown = operation === "dilation" ? reflectElement(element) : element;
      const n = iterationsOf(params);
      const statistic = STATISTIC[operation];
      return {
        kind: "morphology",
        element: shown.rows,
        anchor: { x: shown.anchorX, y: shown.anchorY },
        operation: FORMULAS[operation],
        ...(statistic ? { statistic } : {}),
        note:
          (operation === "dilation"
            ? "The grid shows the element turned by 180 degrees, the offsets dilation reads. "
            : "") + (n > 1 ? `Each erosion or dilation runs ${n} times.` : ""),
      };
    },
  };
}

export const erosionFilter: PlaneFilter = { ...morphologyFilter("erosion"), id: "erosion" };
export const dilationFilter: PlaneFilter = { ...morphologyFilter("dilation"), id: "dilation" };
export const openingFilter: PlaneFilter = { ...morphologyFilter("opening"), id: "opening" };
export const closingFilter: PlaneFilter = { ...morphologyFilter("closing"), id: "closing" };
export const morphGradientFilter: PlaneFilter = {
  ...morphologyFilter("morph-gradient"),
  id: "morph-gradient",
};
export const internalGradientFilter: PlaneFilter = {
  ...morphologyFilter("internal-gradient"),
  id: "internal-gradient",
};
export const externalGradientFilter: PlaneFilter = {
  ...morphologyFilter("external-gradient"),
  id: "external-gradient",
};
export const tophatFilter: PlaneFilter = { ...morphologyFilter("tophat"), id: "tophat" };
export const blackhatFilter: PlaneFilter = { ...morphologyFilter("blackhat"), id: "blackhat" };
