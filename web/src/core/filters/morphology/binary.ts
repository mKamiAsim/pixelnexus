/**
 * Binary morphology. Catalog entries in catalog/filters/morphology/: hit-or-miss, thinning,
 * thickening, skeleton, pruning, convex-hull and ccl-filter.
 *
 * The input is read as binary: values at or above 128 are foreground. Results are 255 for
 * foreground and 0 for background. Thinning, thickening, the skeleton, pruning, the convex hull
 * and component filtering follow shapes as far as they reach, so they are global filters and
 * treat everything outside the image as background. Hit-or-miss is local and extends the image
 * once with the border mode.
 */
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import { parseKernel } from "@/core/filters/linear/weighted-average";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { elementOf, elementOffsets, elementReach } from "./structuring";

/** Foreground (1) where the value is at least 128. */
export function binaryOf(input: Plane): Uint8Array {
  return Uint8Array.from(input.data, (v) => (v >= 128 ? 1 : 0));
}

function toPlane(bits: Uint8Array, width: number, height: number): Plane {
  const out = createPlane(width, height);
  bits.forEach((b, i) => {
    out.data[i] = b ? 255 : 0;
  });
  return out;
}

/** The 8 neighbors of (x, y) as bits E, NE, N, NW, W, SW, S, SE, with 0 outside. */
function neighborCode(bits: Uint8Array, width: number, height: number, x: number, y: number) {
  const at = (dx: number, dy: number) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < width && ny < height ? (bits[ny * width + nx] ?? 0) : 0;
  };
  return (
    at(1, 0) |
    (at(1, -1) << 1) |
    (at(0, -1) << 2) |
    (at(-1, -1) << 3) |
    (at(-1, 0) << 4) |
    (at(-1, 1) << 5) |
    (at(0, 1) << 6) |
    (at(1, 1) << 7)
  );
}

const bit = (code: number, i: number) => ((code >> (i % 8)) & 1) === 1;

/** Guo and Hall's two deletion tables, built as in skimage.morphology.thin. */
function guoHallTables(): [Uint8Array, Uint8Array] {
  const first = new Uint8Array(256);
  const second = new Uint8Array(256);
  for (let n = 0; n < 256; n++) {
    let crossings = 0;
    for (const i of [0, 2, 4, 6]) if (!bit(n, i) && (bit(n, i + 1) || bit(n, i + 2))) crossings++;
    let n1 = 0;
    let n2 = 0;
    for (const k of [1, 3, 5, 7]) {
      if (bit(n, k) || bit(n, k - 1)) n1++;
      if (bit(n, k) || bit(n, k + 1)) n2++;
    }
    const g12 = crossings === 1 && [2, 3].includes(Math.min(n1, n2));
    const g3 = !((bit(n, 1) || bit(n, 2) || !bit(n, 7)) && bit(n, 0));
    const g3p = !((bit(n, 5) || bit(n, 6) || !bit(n, 3)) && bit(n, 4));
    first[n] = g12 && g3 ? 1 : 0;
    second[n] = g12 && g3p ? 1 : 0;
  }
  return [first, second];
}

/** Zhang and Suen's two deletion tables, from the conditions of their paper. */
function zhangSuenTables(): [Uint8Array, Uint8Array] {
  const first = new Uint8Array(256);
  const second = new Uint8Array(256);
  for (let n = 0; n < 256; n++) {
    // P2 to P9 run clockwise from north: N, NE, E, SE, S, SW, W, NW.
    const p = [2, 1, 0, 7, 6, 5, 4, 3].map((i) => bit(n, i));
    const [p2, , p4, , p6, , p8] = p;
    const b = p.filter(Boolean).length;
    let a = 0;
    for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
    const base = b >= 2 && b <= 6 && a === 1;
    first[n] = base && !(p2 && p4 && p6) && !(p4 && p6 && p8) ? 1 : 0;
    second[n] = base && !(p2 && p4 && p8) && !(p2 && p6 && p8) ? 1 : 0;
  }
  return [first, second];
}

const TABLES = { "guo-hall": guoHallTables(), "zhang-suen": zhangSuenTables() };
export type ThinningMethod = keyof typeof TABLES;

/**
 * Thinning by two sub-iterations per iteration. In each one, every foreground pixel whose
 * neighbors are marked in that sub-iteration's table is removed at once. It stops when an
 * iteration removes nothing, or after `limit` iterations.
 */
export function thin(
  bits: Uint8Array,
  width: number,
  height: number,
  method: ThinningMethod,
  limit = Infinity,
): Uint8Array {
  let current = Uint8Array.from(bits);
  for (let iteration = 0; iteration < limit; iteration++) {
    let removed = false;
    for (const table of TABLES[method]) {
      const next = Uint8Array.from(current);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (current[i] && table[neighborCode(current, width, height, x, y)]) {
            next[i] = 0;
            removed = true;
          }
        }
      }
      current = next;
    }
    if (!removed) break;
  }
  return current;
}

const methodOf = (params: Params) =>
  read.string<ThinningMethod>(params, "method", "zhang-suen") === "guo-hall"
    ? "guo-hall"
    : "zhang-suen";
const limitOf = (params: Params) => {
  const n = Math.round(read.number(params, "iterations", 0));
  return n > 0 ? n : Infinity;
};

function binaryFilter(
  id: string,
  run: (bits: Uint8Array, width: number, height: number, params: Params) => Uint8Array,
  stages: (params: Params) => { name: string; formula: string; note?: string }[],
): PlaneFilter {
  return {
    id,
    kind: "smooth",
    alphaWeighted: false,
    global: true,
    radius: () => 0,
    plane: (input, params) =>
      toPlane(run(binaryOf(input), input.width, input.height, params), input.width, input.height),
    representation: (params) => ({
      kind: "stages",
      stages: [
        { name: "Binary image", formula: "A = \\{\\, p : f(p) \\ge 128 \\,\\}" },
        ...stages(params),
      ],
      note: "The result is 255 on the foreground and 0 elsewhere. Pixels outside the image are background.",
    }),
  };
}

const THIN_STAGE = (params: Params) => ({
  name: methodOf(params) === "guo-hall" ? "Guo-Hall thinning" : "Zhang-Suen thinning",
  formula: "A_{k+1} = A_k \\setminus D_2\\left(A_k \\setminus D_1(A_k)\\right)",
  note: `D_1 and D_2 are the pixels the two sub-iterations may remove. ${
    limitOf(params) === Infinity
      ? "Until nothing changes."
      : `At most ${limitOf(params)} iterations.`
  }`,
});

export const thinningFilter: PlaneFilter = {
  ...binaryFilter(
    "thinning",
    (bits, w, h, params) => thin(bits, w, h, methodOf(params), limitOf(params)),
    (params) => [THIN_STAGE(params)],
  ),
  id: "thinning",
};

export const thickeningFilter: PlaneFilter = {
  ...binaryFilter(
    "thickening",
    (bits, w, h, params) => {
      const background = bits.map((b) => 1 - b);
      const n = Math.max(1, Math.round(read.number(params, "iterations", 3)));
      return thin(background, w, h, methodOf(params), n).map((b) => 1 - b);
    },
    (params) => [
      { name: "Complement", formula: "A^c" },
      {
        ...THIN_STAGE({ ...params, iterations: read.number(params, "iterations", 3) }),
        name: "Thin the complement",
      },
      { name: "Complement again", formula: "A \\odot = \\left(\\text{thin}(A^c)\\right)^c" },
    ],
  ),
  id: "thickening",
};

/** Lantuejoul's skeleton: the union over k of (A eroded k times) minus its opening. */
export function morphologicalSkeleton(
  bits: Uint8Array,
  width: number,
  height: number,
  element: string,
): Uint8Array {
  const offsets = elementOffsets(elementOf(element));
  const erode = (a: Uint8Array) => {
    const out = new Uint8Array(a.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let all = 1;
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !a[ny * width + nx]) {
            all = 0;
            break;
          }
        }
        out[y * width + x] = all;
      }
    }
    return out;
  };
  const dilate = (a: Uint8Array) => {
    const out = new Uint8Array(a.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!a[y * width + x]) continue;
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) out[ny * width + nx] = 1;
        }
      }
    }
    return out;
  };
  const skeleton = new Uint8Array(bits.length);
  let eroded = Uint8Array.from(bits);
  while (eroded.some(Boolean)) {
    const opened = dilate(erode(eroded));
    eroded.forEach((v, i) => {
      if (v && !opened[i]) skeleton[i] = 1;
    });
    eroded = erode(eroded);
  }
  return skeleton;
}

export const skeletonFilter: PlaneFilter = {
  ...binaryFilter(
    "skeleton",
    (bits, w, h, params) =>
      morphologicalSkeleton(bits, w, h, read.string(params, "element", "cross 1")),
    () => [
      {
        name: "Skeleton",
        formula:
          "S(A) = \\bigcup_{k \\ge 0} \\left( (A \\ominus kB) \\setminus (A \\ominus kB) \\circ B \\right)",
        note: "A eroded k times by B, minus its opening by B, for every k until the erosion is empty.",
      },
    ],
  ),
  id: "skeleton",
};

/**
 * True for the neighbor codes of an end point: one corner neighbor alone, or one side neighbor
 * with none, one or both of the corners next to it. Bits run E, NE, N, NW, W, SW, S, SE.
 */
export function isEndCode(code: number): boolean {
  if (code === 0) return false;
  if ([1, 3, 5, 7].some((c) => code === 1 << c)) return true;
  return [0, 2, 4, 6].some((side) => {
    const allowed = (1 << side) | (1 << ((side + 1) % 8)) | (1 << ((side + 7) % 8));
    return (code & (1 << side)) !== 0 && (code & ~allowed) === 0;
  });
}

/** The end points of a binary image. */
function endPoints(bits: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(bits.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (bits[i] && isEndCode(neighborCode(bits, width, height, x, y))) out[i] = 1;
    }
  }
  return out;
}

/**
 * Pruning in the four steps of Gonzalez and Woods: remove end points n times, find the end
 * points left, grow them back n times inside the input with the 3 x 3 square, and join.
 */
export function prune(bits: Uint8Array, width: number, height: number, n: number): Uint8Array {
  let thinned = Uint8Array.from(bits);
  for (let k = 0; k < n; k++) {
    const ends = endPoints(thinned, width, height);
    thinned = thinned.map((v, i) => (v && !ends[i] ? 1 : 0));
  }
  let grown = endPoints(thinned, width, height);
  for (let k = 0; k < n; k++) {
    const next = Uint8Array.from(grown);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!grown[y * width + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && bits[ny * width + nx]) {
              next[ny * width + nx] = 1;
            }
          }
        }
      }
    }
    grown = next;
  }
  return thinned.map((v, i) => (v || grown[i] ? 1 : 0));
}

export const pruningFilter: PlaneFilter = {
  ...binaryFilter(
    "pruning",
    (bits, w, h, params) =>
      prune(bits, w, h, Math.max(1, Math.round(read.number(params, "length", 3)))),
    (params) => {
      const n = Math.max(1, Math.round(read.number(params, "length", 3)));
      return [
        {
          name: "Remove end points",
          formula: `X_1 = A \\text{ with end points removed ${n} times}`,
        },
        { name: "End points left", formula: "X_2 = \\text{end points of } X_1" },
        {
          name: "Grow back",
          formula: `X_3 = \\left(X_2 \\oplus H\\right) \\cap A \\text{, ${n} times}`,
          note: "H is the 3 x 3 square.",
        },
        { name: "Join", formula: "X_4 = X_1 \\cup X_3" },
      ];
    },
  ),
  id: "pruning",
};

/** Connected components with 4 or 8 neighbors: a label from 1 for each pixel, 0 for background. */
export function labelComponents(
  bits: Uint8Array,
  width: number,
  height: number,
  connectivity: 4 | 8,
) {
  const labels = new Int32Array(bits.length);
  const steps =
    connectivity === 4
      ? [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
      : [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ];
  let count = 0;
  for (let start = 0; start < bits.length; start++) {
    if (!bits[start] || labels[start]) continue;
    count++;
    labels[start] = count;
    const stack = [start];
    for (let p = stack.pop(); p !== undefined; p = stack.pop()) {
      const x = p % width;
      const y = (p - x) / width;
      for (const [dx = 0, dy = 0] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (bits[q] && !labels[q]) {
          labels[q] = count;
          stack.push(q);
        }
      }
    }
  }
  return { labels, count };
}

const connectivityOf = (params: Params): 4 | 8 =>
  read.string<"4" | "8">(params, "connectivity", "8") === "4" ? 4 : 8;

export const cclFilter: PlaneFilter = {
  ...binaryFilter(
    "ccl-filter",
    (bits, w, h, params) => {
      const { labels, count } = labelComponents(bits, w, h, connectivityOf(params));
      const area = new Int32Array(count + 1);
      labels.forEach((l) => area[l]++);
      const low = read.number(params, "minArea", 10);
      const high = read.number(params, "maxArea", 100000);
      return Uint8Array.from(labels, (l) =>
        l && (area[l] ?? 0) >= low && (area[l] ?? 0) <= high ? 1 : 0,
      );
    },
    (params) => [
      {
        name: "Components",
        formula: "A = C_1 \\cup \\dots \\cup C_m",
        note: `Joined through ${connectivityOf(params)} neighbors.`,
      },
      {
        name: "Keep by area",
        formula: `\\bigcup \\{\\, C_i : ${read.number(params, "minArea", 10)} \\le |C_i| \\le ${read.number(params, "maxArea", 100000)} \\,\\}`,
      },
    ],
  ),
  id: "ccl-filter",
};

type Point = [number, number];

/** The convex hull of points by the monotone chain, counterclockwise, without repeats. */
function hull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as Point, lower[lower.length - 1] as Point, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of pts.reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as Point, upper[upper.length - 1] as Point, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The convex hull of each component, as skimage.morphology.convex_hull_object builds it: the
 * hull of the edge midpoints of the component's pixels, filled with every pixel whose center
 * lies inside the hull or on its border.
 */
export function convexHullObjects(
  bits: Uint8Array,
  width: number,
  height: number,
  connectivity: 4 | 8,
): Uint8Array {
  const { labels, count } = labelComponents(bits, width, height, connectivity);
  const groups: Point[][] = Array.from({ length: count + 1 }, () => []);
  labels.forEach((l, i) => {
    if (!l) return;
    const x = i % width;
    const y = (i - x) / width;
    groups[l]?.push([x + 0.5, y], [x - 0.5, y], [x, y + 0.5], [x, y - 0.5]);
  });
  const out = new Uint8Array(bits.length);
  for (let l = 1; l <= count; l++) {
    const polygon = hull(groups[l] ?? []);
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    for (
      let y = Math.max(0, Math.floor(Math.min(...ys)));
      y <= Math.min(height - 1, Math.ceil(Math.max(...ys)));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(Math.min(...xs)));
        x <= Math.min(width - 1, Math.ceil(Math.max(...xs)));
        x++
      ) {
        // Inside or on the border of a counterclockwise convex polygon: never right of an edge.
        let inside = true;
        for (let k = 0; k < polygon.length; k++) {
          const a = polygon[k] as Point;
          const b = polygon[(k + 1) % polygon.length] as Point;
          if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) {
            inside = false;
            break;
          }
        }
        if (inside) out[y * width + x] = 1;
      }
    }
  }
  return out;
}

export const convexHullFilter: PlaneFilter = {
  ...binaryFilter(
    "convex-hull",
    (bits, w, h, params) => convexHullObjects(bits, w, h, connectivityOf(params)),
    (params) => [
      {
        name: "Components",
        formula: "A = C_1 \\cup \\dots \\cup C_m",
        note: `Joined through ${connectivityOf(params)} neighbors.`,
      },
      {
        name: "Hulls",
        formula: "\\bigcup_i \\operatorname{conv}(C_i)",
        note: "Pixels whose centers lie inside a hull or on its border.",
      },
    ],
  ),
  id: "convex-hull",
};

/** A hit-or-miss pattern: 1 must be foreground, -1 must be background, 0 is either. */
export function patternOf(text: string): { rows: number[][]; ok: boolean } {
  const parsed = parseKernel(text);
  const fallback = [
    [-1, -1, -1],
    [-1, 1, -1],
    [-1, -1, -1],
  ];
  if (!parsed.ok || parsed.rows.flat().some((v) => v !== 1 && v !== -1 && v !== 0)) {
    return { rows: fallback, ok: false };
  }
  return { rows: parsed.rows, ok: true };
}

export const hitOrMissFilter: PlaneFilter = {
  id: "hit-or-miss",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => {
    const { rows } = patternOf(read.string(params, "pattern", ""));
    return Math.max(rows.length, rows[0]?.length ?? 0) >> 1;
  },
  plane: (input, params, { border }) => {
    const { rows } = patternOf(read.string(params, "pattern", ""));
    const ry = rows.length >> 1;
    const rx = (rows[0]?.length ?? 1) >> 1;
    const r = Math.max(rx, ry);
    const padded = padPlane(input, r, border);
    const bits = binaryOf(padded);
    const { width, height } = padded;
    const out = createPlane(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let hit = true;
        for (let j = 0; j < rows.length && hit; j++) {
          for (let i = 0; i < (rows[j]?.length ?? 0); i++) {
            const want = rows[j]?.[i] ?? 0;
            if (want === 0) continue;
            const nx = Math.min(width - 1, Math.max(0, x + i - rx));
            const ny = Math.min(height - 1, Math.max(0, y + j - ry));
            if ((bits[ny * width + nx] ?? 0) !== (want === 1 ? 1 : 0)) {
              hit = false;
              break;
            }
          }
        }
        out.data[y * width + x] = hit ? 255 : 0;
      }
    }
    return cropPlane(out, r);
  },
  representation: (params) => {
    const { rows } = patternOf(read.string(params, "pattern", ""));
    return {
      kind: "morphology",
      element: rows.map((row) => row.map((v) => (v === 1 ? 1 : 0))),
      anchor: { x: (rows[0]?.length ?? 1) >> 1, y: rows.length >> 1 },
      operation: "A \\circledast (B_1, B_2) = (A \\ominus B_1) \\cap (A^c \\ominus B_2)",
      note: `The grid shows B_1, the pixels that must be foreground. B_2, the pixels that must be background, is ${
        rows.flat().filter((v) => v === -1).length
      } pixels. The result is 255 where the pattern matches.`,
    };
  },
};

/** The structuring element reach of the skeleton, for the Inspector only. */
export const skeletonReach = (params: Params) =>
  elementReach(elementOf(read.string(params, "element", "cross 1")));
