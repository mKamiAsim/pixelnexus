/**
 * Morphological reconstruction and the filters built on it. Catalog entries in
 * catalog/filters/morphology/: reconstruction, opening-by-reconstruction,
 * closing-by-reconstruction, geodesic, asf and leveling.
 *
 * Reconstruction by dilation grows a marker J under a mask I, through 4 or 8 neighbors, until
 * nothing changes: every regional bump of I that the marker touches comes back whole, and the
 * others stay flattened. It uses the hybrid algorithm of Vincent (1993): a raster scan, an
 * anti-raster scan, and a queue for the rest. Reconstruction by erosion is the same on negated
 * values. The marker is clamped first: J = min(J, I) for dilation and max(J, I) for erosion.
 * Results match skimage.morphology.reconstruction.
 *
 * Reconstruction is global: a bump can reach across the whole image. These filters run on the
 * whole image and need no border, except where a step uses a structuring element.
 */
import { gaussianPlane } from "@/core/filters/linear/gaussian";
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { dilatePlane, elementParam, erodePlane, iterationsOf, morphology } from "./gray";
import { elementOf, elementReach, type StructuringElement } from "./structuring";

export type Connectivity = 4 | 8;

/** Neighbor offsets that come before a pixel in raster order. */
function before(connectivity: Connectivity): [number, number][] {
  return connectivity === 4
    ? [
        [-1, 0],
        [0, -1],
      ]
    : [
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ];
}

/** Reconstruction by dilation of a marker under a mask, by Vincent's hybrid algorithm. */
function reconstructByDilation(marker: Plane, mask: Plane, connectivity: Connectivity): Plane {
  const { width, height } = mask;
  const I = mask.data;
  const J = Float64Array.from(marker.data, (v, i) => Math.min(v, I[i] ?? 0));
  const plus = before(connectivity);
  const minus = plus.map(([dx, dy]) => [-dx, -dy] as [number, number]);
  const all = [...plus, ...minus];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let m = J[i] ?? 0;
      for (const [dx, dy] of plus) {
        if (inside(x + dx, y + dy)) m = Math.max(m, J[(y + dy) * width + x + dx] ?? 0);
      }
      J[i] = Math.min(m, I[i] ?? 0);
    }
  }
  const queue: number[] = [];
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let m = J[i] ?? 0;
      for (const [dx, dy] of minus) {
        if (inside(x + dx, y + dy)) m = Math.max(m, J[(y + dy) * width + x + dx] ?? 0);
      }
      J[i] = Math.min(m, I[i] ?? 0);
      for (const [dx, dy] of minus) {
        if (!inside(x + dx, y + dy)) continue;
        const q = (y + dy) * width + x + dx;
        if ((J[q] ?? 0) < (J[i] ?? 0) && (J[q] ?? 0) < (I[q] ?? 0)) {
          queue.push(i);
          break;
        }
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head] ?? 0;
    const x = p % width;
    const y = (p - x) / width;
    for (const [dx, dy] of all) {
      if (!inside(x + dx, y + dy)) continue;
      const q = (y + dy) * width + x + dx;
      if ((J[q] ?? 0) < (J[p] ?? 0) && (I[q] ?? 0) !== (J[q] ?? 0)) {
        J[q] = Math.min(J[p] ?? 0, I[q] ?? 0);
        queue.push(q);
      }
    }
  }
  const out = createPlane(width, height);
  out.data.set(J);
  return out;
}

const negate = (p: Plane): Plane => ({ ...p, data: p.data.map((v) => -v) });

/** Reconstruction of a marker under (dilation) or over (erosion) a mask. */
export function reconstruct(
  marker: Plane,
  mask: Plane,
  method: "dilation" | "erosion",
  connectivity: Connectivity,
): Plane {
  return method === "dilation"
    ? reconstructByDilation(marker, mask, connectivity)
    : negate(reconstructByDilation(negate(marker), negate(mask), connectivity));
}

const connectivityOf = (params: Params): Connectivity =>
  read.string<"4" | "8">(params, "connectivity", "8") === "4" ? 4 : 8;
const methodOf = (params: Params) =>
  read.string<"dilation" | "erosion">(params, "method", "dilation");
const hOf = (params: Params) => read.number(params, "h", 20);

/** The image moved down by h for dilation, or up by h for erosion. */
function shifted(input: Plane, h: number, method: "dilation" | "erosion"): Plane {
  return { ...input, data: input.data.map((v) => (method === "dilation" ? v - h : v + h)) };
}

const CONNECTIVITY_NOTE = (params: Params) =>
  `Paths step between ${connectivityOf(params)} neighbors.`;

export const reconstructionFilter: PlaneFilter = {
  id: "reconstruction",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params) => {
    const method = methodOf(params);
    return reconstruct(shifted(input, hOf(params), method), input, method, connectivityOf(params));
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Marker",
        formula:
          methodOf(params) === "dilation" ? `J = f - ${hOf(params)}` : `J = f + ${hOf(params)}`,
      },
      {
        name: "Reconstruction",
        formula:
          methodOf(params) === "dilation"
            ? "R^{\\delta}_f(J) = \\lim_{k \\to \\infty} \\left(\\delta(J_k) \\wedge f\\right)"
            : "R^{\\varepsilon}_f(J) = \\lim_{k \\to \\infty} \\left(\\varepsilon(J_k) \\vee f\\right)",
        note: CONNECTIVITY_NOTE(params),
      },
    ],
  }),
};

/** The first step of opening or closing by reconstruction, on the whole image. */
function firstStep(
  input: Plane,
  params: Params,
  border: Parameters<typeof padPlane>[2],
  kind: "erosion" | "dilation",
): Plane {
  const reach = iterationsOf(params) * elementReach(elementParam(params));
  const result = morphology(
    padPlane(input, reach, border),
    kind,
    elementParam(params),
    iterationsOf(params),
  );
  return cropPlane(result, reach);
}

function byReconstruction(
  id: "opening-by-reconstruction" | "closing-by-reconstruction",
): PlaneFilter {
  const opening = id === "opening-by-reconstruction";
  return {
    id,
    kind: "smooth",
    alphaWeighted: false,
    global: true,
    radius: () => 0,
    plane: (input, params, { border }) =>
      reconstruct(
        firstStep(input, params, border, opening ? "erosion" : "dilation"),
        input,
        opening ? "dilation" : "erosion",
        connectivityOf(params),
      ),
    representation: (params) => ({
      kind: "stages",
      stages: [
        {
          name: opening ? "Erosion" : "Dilation",
          formula: opening ? "J = f \\ominus B" : "J = f \\oplus B",
          note: `With the structuring element, ${iterationsOf(params)} time${iterationsOf(params) > 1 ? "s" : ""}.`,
        },
        {
          name: "Reconstruction",
          formula: opening ? "R^{\\delta}_f(J)" : "R^{\\varepsilon}_f(J)",
          note: CONNECTIVITY_NOTE(params),
        },
      ],
    }),
  };
}

export const openingByReconstructionFilter: PlaneFilter = {
  ...byReconstruction("opening-by-reconstruction"),
  id: "opening-by-reconstruction",
};
export const closingByReconstructionFilter: PlaneFilter = {
  ...byReconstruction("closing-by-reconstruction"),
  id: "closing-by-reconstruction",
};

/** The elementary element of a connectivity: the 3 x 3 cross or square. */
function unitElement(connectivity: Connectivity): StructuringElement {
  return elementOf(connectivity === 4 ? "cross 1" : "rect 3 3");
}

const stepsOf = (params: Params) => Math.max(1, Math.round(read.number(params, "steps", 5)));

/** n steps of geodesic dilation (under f) or erosion (over f), with edges that repeat. */
export function geodesic(
  marker: Plane,
  mask: Plane,
  method: "dilation" | "erosion",
  steps: number,
  connectivity: Connectivity,
): Plane {
  const unit = unitElement(connectivity);
  let J: Plane = {
    ...marker,
    data: marker.data.map((v, i) =>
      method === "dilation" ? Math.min(v, mask.data[i] ?? 0) : Math.max(v, mask.data[i] ?? 0),
    ),
  };
  for (let k = 0; k < steps; k++) {
    const grown =
      method === "dilation" ? dilatePlane(J, unit, "replicate") : erodePlane(J, unit, "replicate");
    J = {
      ...grown,
      data: grown.data.map((v, i) =>
        method === "dilation" ? Math.min(v, mask.data[i] ?? 0) : Math.max(v, mask.data[i] ?? 0),
      ),
    };
  }
  return J;
}

export const geodesicFilter: PlaneFilter = {
  id: "geodesic",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params) => {
    const method = methodOf(params);
    return geodesic(
      shifted(input, hOf(params), method),
      input,
      method,
      stepsOf(params),
      connectivityOf(params),
    );
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Marker",
        formula:
          methodOf(params) === "dilation" ? `J_0 = f - ${hOf(params)}` : `J_0 = f + ${hOf(params)}`,
      },
      {
        name: "Steps",
        formula:
          methodOf(params) === "dilation"
            ? "J_{k+1} = \\delta_N(J_k) \\wedge f"
            : "J_{k+1} = \\varepsilon_N(J_k) \\vee f",
        note: `${stepsOf(params)} steps. N is the 3 x 3 ${connectivityOf(params) === 4 ? "cross" : "square"}.`,
      },
    ],
  }),
};

type AsfShape = "disk" | "square" | "diamond";
const asfElement = (shape: AsfShape, i: number) =>
  elementOf(shape === "square" ? `rect ${2 * i + 1} ${2 * i + 1}` : `${shape} ${i}`);
const sizeOf = (params: Params) => Math.max(1, Math.round(read.number(params, "size", 3)));
const shapeOf = (params: Params) => read.string<AsfShape>(params, "shape", "disk");
const orderOf = (params: Params) =>
  read.string<"open-close" | "close-open">(params, "order", "open-close");
/** Each stage opens and closes with an element of reach i, so it reaches 4 i. */
const asfReach = (params: Params) => 2 * sizeOf(params) * (sizeOf(params) + 1);

export const asfFilter: PlaneFilter = {
  id: "asf",
  kind: "smooth",
  alphaWeighted: false,
  radius: asfReach,
  plane: (input, params, { border }) => {
    const reach = asfReach(params);
    let p = padPlane(input, reach, border);
    for (let i = 1; i <= sizeOf(params); i++) {
      const element = asfElement(shapeOf(params), i);
      const steps: ("opening" | "closing")[] =
        orderOf(params) === "open-close" ? ["opening", "closing"] : ["closing", "opening"];
      for (const step of steps) p = morphology(p, step, element, 1);
    }
    return cropPlane(p, reach);
  },
  representation: (params) => ({
    kind: "stages",
    stages: Array.from({ length: sizeOf(params) }, (_, k) => ({
      name: `Size ${k + 1}`,
      formula:
        orderOf(params) === "open-close"
          ? `f_{${k + 1}} = (f_{${k}} \\circ B_{${k + 1}}) \\bullet B_{${k + 1}}`
          : `f_{${k + 1}} = (f_{${k}} \\bullet B_{${k + 1}}) \\circ B_{${k + 1}}`,
      note: `B_${k + 1} is ${shapeOf(params) === "square" ? `the ${2 * k + 3} x ${2 * k + 3} square` : `${shapeOf(params)} ${k + 1}`}.`,
    })),
  }),
};

const sigmaOf = (params: Params) => read.number(params, "sigma", 2);
/** Leveling stops after this many steps even if it has not settled. */
export const LEVELING_MAX_STEPS = 2000;

/**
 * Meyer's leveling of f with the marker g: repeat g = max(min(f, dilation of g), erosion of g)
 * with the 3 x 3 element until nothing changes. Where g is below f this is reconstruction by
 * dilation, and where it is above, reconstruction by erosion.
 */
export function leveling(f: Plane, marker: Plane, connectivity: Connectivity): Plane {
  const unit = unitElement(connectivity);
  let g = marker;
  for (let step = 0; step < LEVELING_MAX_STEPS; step++) {
    const up = dilatePlane(g, unit, "replicate");
    const down = erodePlane(g, unit, "replicate");
    let changed = false;
    const next = createPlane(f.width, f.height);
    for (let i = 0; i < next.data.length; i++) {
      const v = Math.max(Math.min(f.data[i] ?? 0, up.data[i] ?? 0), down.data[i] ?? 0);
      next.data[i] = v;
      if (v !== g.data[i]) changed = true;
    }
    g = next;
    if (!changed) break;
  }
  return g;
}

export const levelingFilter: PlaneFilter = {
  id: "leveling",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) => {
    const r = Math.floor(4 * sigmaOf(params) + 0.5);
    const marker = cropPlane(
      gaussianPlane(padPlane(input, r, border), sigmaOf(params), 4, "replicate"),
      r,
    );
    return leveling(input, marker, connectivityOf(params));
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Marker",
        formula: `g_0 = G_{${sigmaOf(params)}} * f`,
        note: `A Gaussian blur with sigma ${sigmaOf(params)}, cut at 4 sigma.`,
      },
      {
        name: "Leveling",
        formula: "g_{k+1} = \\left(f \\wedge \\delta_N(g_k)\\right) \\vee \\varepsilon_N(g_k)",
        note: `Until nothing changes, at most ${LEVELING_MAX_STEPS} steps. N is the 3 x 3 ${connectivityOf(params) === 4 ? "cross" : "square"}.`,
      },
    ],
  }),
};
