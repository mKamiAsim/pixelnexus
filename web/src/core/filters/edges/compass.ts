/**
 * Compass and basis edge filters: Kirsch, Robinson, Frei-Chen and the line detector. Catalog
 * entries in catalog/filters/edges/ and catalog/filters/features/line-detector.yaml.
 *
 * A compass filter turns one 3x3 mask in eight steps of 45 degrees by moving its outer ring one
 * cell at a time, and keeps the largest of the eight responses. The direction output is the
 * angle of the winning mask, measured like the Sobel direction: x to the right, y down, from
 * dark to bright, in degrees from -180 to 180. The first mask has its bright side at the top,
 * -90 degrees, and each next mask turns 45 degrees counterclockwise on screen.
 */
import { correlate2d, kernelFromRows } from "@/core/filters/convolve";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type KernelInfo, type PlaneFilter } from "@/core/filters/types";

/** The outer ring of a 3x3 mask, clockwise from the top left. */
const RING: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [2, 1],
  [2, 0],
  [1, 0],
];

/** The mask turned counterclockwise on screen by k steps of 45 degrees. */
export function turnMask(mask: readonly (readonly number[])[], k: number): number[][] {
  const out = mask.map((row) => [...row]);
  RING.forEach(([r, c], i) => {
    const [fr, fc] = RING[(i + k) % 8] ?? [0, 0];
    (out[r] as number[])[c] = mask[fr]?.[fc] ?? 0;
  });
  return out;
}

export const KIRSCH_NORTH = [
  [5, 5, 5],
  [-3, 0, -3],
  [-3, -3, -3],
];
export const ROBINSON_NORTH = [
  [1, 2, 1],
  [0, 0, 0],
  [-1, -2, -1],
];

/** The eight masks of a compass filter. */
export function compassMasks(north: readonly (readonly number[])[]): number[][][] {
  return Array.from({ length: 8 }, (_, k) => turnMask(north, k));
}

/** The direction of mask k in degrees, from -180 to 180. */
export function compassAngle(k: number): number {
  const a = -90 - 45 * k;
  return a <= -180 ? a + 360 : a;
}

function compassPlane(
  input: Plane,
  masks: readonly (readonly (readonly number[])[])[],
  border: BorderMode,
  output: "magnitude" | "direction",
): Plane {
  const responses = masks.map((m) => correlate2d(input, kernelFromRows(m), border));
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < out.data.length; i++) {
    let best = 0;
    for (let k = 1; k < responses.length; k++) {
      if ((responses[k]?.data[i] ?? 0) > (responses[best]?.data[i] ?? 0)) best = k;
    }
    out.data[i] = output === "direction" ? compassAngle(best) : (responses[best]?.data[i] ?? 0);
  }
  return out;
}

const NAMES = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];

function compassFilter(id: "kirsch" | "robinson", north: number[][], letter: string): PlaneFilter {
  const masks = compassMasks(north);
  return {
    id,
    kind: "derived",
    alphaWeighted: false,
    radius: () => 1,
    plane: (input, params, { border }) =>
      compassPlane(
        input,
        masks,
        border,
        read.string<"magnitude" | "direction">(params, "output", "magnitude"),
      ),
    representation: () => ({
      kind: "kernels",
      kernels: masks.map((rows, k): KernelInfo => ({
        name: `${letter}_{\\text{${NAMES[k]}}}`,
        rows,
        anchor: { x: 1, y: 1 },
        normalized: false,
        note: `Bright side toward ${NAMES[k]}, direction ${compassAngle(k)} degrees.`,
      })),
    }),
  };
}

export const kirschFilter: PlaneFilter = {
  ...compassFilter("kirsch", KIRSCH_NORTH, "K"),
  id: "kirsch",
};
export const robinsonFilter: PlaneFilter = {
  ...compassFilter("robinson", ROBINSON_NORTH, "R"),
  id: "robinson",
};

// Frei-Chen -----------------------------------------------------------------------------------

const S2 = Math.SQRT2;
/**
 * The nine orthonormal Frei-Chen masks: four edge masks, four line masks and the mean. They are
 * an orthonormal basis of 3x3 windows, so the squared projections add up to the window energy.
 */
export const FREI_CHEN: readonly number[][][] = [
  {
    m: [
      [1, S2, 1],
      [0, 0, 0],
      [-1, -S2, -1],
    ],
    f: 1 / (2 * S2),
  },
  {
    m: [
      [1, 0, -1],
      [S2, 0, -S2],
      [1, 0, -1],
    ],
    f: 1 / (2 * S2),
  },
  {
    m: [
      [0, -1, S2],
      [1, 0, -1],
      [-S2, 1, 0],
    ],
    f: 1 / (2 * S2),
  },
  {
    m: [
      [S2, -1, 0],
      [-1, 0, 1],
      [0, 1, -S2],
    ],
    f: 1 / (2 * S2),
  },
  {
    m: [
      [0, 1, 0],
      [-1, 0, -1],
      [0, 1, 0],
    ],
    f: 1 / 2,
  },
  {
    m: [
      [-1, 0, 1],
      [0, 0, 0],
      [1, 0, -1],
    ],
    f: 1 / 2,
  },
  {
    m: [
      [1, -2, 1],
      [-2, 4, -2],
      [1, -2, 1],
    ],
    f: 1 / 6,
  },
  {
    m: [
      [-2, 1, -2],
      [1, 4, 1],
      [-2, 1, -2],
    ],
    f: 1 / 6,
  },
  {
    m: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    f: 1 / 3,
  },
].map(({ m, f }) => m.map((row) => row.map((v) => v * f)));

export const freiChenFilter: PlaneFilter = {
  id: "frei-chen",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 1,
  plane: (input, params, { border }) => {
    const p = FREI_CHEN.map((m) => correlate2d(input, kernelFromRows(m), border));
    const line = read.string<"edge" | "line">(params, "output", "edge") === "line";
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) {
      let total = 0;
      let part = 0;
      p.forEach((plane, k) => {
        const v = (plane.data[i] ?? 0) ** 2;
        total += v;
        if (line ? k >= 4 && k < 8 : k < 4) part += v;
      });
      out.data[i] = total > 0 ? 255 * Math.sqrt(part / total) : 0;
    }
    return out;
  },
  representation: () => ({
    kind: "kernels",
    kernels: FREI_CHEN.map((rows, k): KernelInfo => ({
      name: `F_${k + 1}`,
      rows,
      anchor: { x: 1, y: 1 },
      normalized: false,
      note: k < 4 ? "Edge subspace." : k < 8 ? "Line subspace." : "The mean.",
    })),
  }),
};

// Line detector -------------------------------------------------------------------------------

/** The four line masks of Gonzalez and Woods, by the direction of the bright line they find. */
export const LINE_MASKS = {
  horizontal: [
    [-1, -1, -1],
    [2, 2, 2],
    [-1, -1, -1],
  ],
  vertical: [
    [-1, 2, -1],
    [-1, 2, -1],
    [-1, 2, -1],
  ],
  falling: [
    [2, -1, -1],
    [-1, 2, -1],
    [-1, -1, 2],
  ],
  rising: [
    [-1, -1, 2],
    [-1, 2, -1],
    [2, -1, -1],
  ],
} as const;

type LineOutput = "max" | keyof typeof LINE_MASKS;

export const lineDetectorFilter: PlaneFilter = {
  id: "line-detector",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 1,
  plane: (input, params, { border }) => {
    const output = read.string<LineOutput>(params, "output", "max");
    const run = (rows: readonly (readonly number[])[]) =>
      correlate2d(input, kernelFromRows(rows), border);
    if (output !== "max") return run(LINE_MASKS[output]);
    const responses = Object.values(LINE_MASKS).map(run);
    const out = createPlane(input.width, input.height);
    for (let i = 0; i < out.data.length; i++) {
      out.data[i] = Math.max(...responses.map((r) => r.data[i] ?? 0));
    }
    return out;
  },
  representation: () => ({
    kind: "kernels",
    kernels: Object.entries(LINE_MASKS).map(([name, rows]): KernelInfo => ({
      name: `L_{\\text{${name}}}`,
      rows: rows.map((r) => [...r]),
      anchor: { x: 1, y: 1 },
      normalized: false,
      note: `Responds most to a bright one-pixel line that runs ${name === "falling" ? "from top left to bottom right" : name === "rising" ? "from bottom left to top right" : name}.`,
    })),
  }),
};
