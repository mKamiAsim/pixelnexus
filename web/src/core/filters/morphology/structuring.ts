/**
 * Structuring elements for morphology, the value of the structuring-element parameter type.
 *
 * An element is written as a shape name and its sizes. The anchor is the center.
 *
 *   disk r        offsets with x^2 + y^2 <= r^2, as skimage.morphology.disk(r)
 *   rect w h      a w x h rectangle, with odd sides
 *   ellipse a b   offsets with (x / (a + 1))^2 + (y / (b + 1))^2 < 1, as
 *                 skimage.morphology.ellipse(a, b)
 *   cross r       the center row and the center column, r pixels each way
 *   diamond r     offsets with |x| + |y| <= r, as skimage.morphology.diamond(r)
 *   line L t      the pixels nearest to k (cos t, -sin t) for k = -h, ..., h with
 *                 h = floor((L - 1) / 2). The angle t is in degrees and turns counterclockwise,
 *                 since y points down.
 *   custom rows   rows of 0 and 1 separated by semicolons, with odd sides
 */

export interface StructuringElement {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  /** 1 where the element is, row by row. */
  readonly rows: readonly (readonly number[])[];
}

export type ParsedElement =
  | { readonly ok: true; readonly element: StructuringElement; readonly shape: string }
  | { readonly ok: false; readonly message: string };

/** The largest radius for disk, cross and diamond, and the largest side for the others. */
export const MAX_RADIUS = 15;
export const MAX_SIDE = 31;

export const SHAPES = ["disk", "rect", "ellipse", "cross", "diamond", "line", "custom"] as const;

function fromPredicate(rx: number, ry: number, inside: (x: number, y: number) => boolean) {
  return {
    width: 2 * rx + 1,
    height: 2 * ry + 1,
    anchorX: rx,
    anchorY: ry,
    rows: Array.from({ length: 2 * ry + 1 }, (_, j) =>
      Array.from({ length: 2 * rx + 1 }, (_, i) => (inside(i - rx, j - ry) ? 1 : 0)),
    ),
  };
}

/** The pixels of a line of length L at angle t degrees, centered on the origin. */
export function linePixels(length: number, angle: number): [number, number][] {
  const h = Math.floor((length - 1) / 2);
  const t = (angle * Math.PI) / 180;
  const c = Math.cos(t);
  const s = -Math.sin(t);
  const pixels: [number, number][] = [];
  for (let k = -h; k <= h; k++) {
    // Round halves away from 0, the same on both sides of the center.
    const round = (v: number) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5);
    pixels.push([round(k * c), round(k * s)]);
  }
  return pixels;
}

const isWhole = (v: number) => Number.isInteger(v);

/** Parse a structuring element, with a message for the panel when it is not valid. */
export function parseStructuringElement(text: string): ParsedElement {
  const [name = "", ...rest] = text.trim().split(/\s+/);
  const shape = name.toLowerCase();
  if (shape === "custom") {
    const lines = rest
      .join(" ")
      .split(";")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const rows = lines.map((line) => line.split(/[\s,]+/).map(Number));
    const width = rows[0]?.length ?? 0;
    if (rows.length === 0) return { ok: false, message: "The custom element is empty." };
    if (rows.some((row) => row.length !== width)) {
      return { ok: false, message: "Every row needs the same number of values." };
    }
    if (rows.flat().some((v) => v !== 0 && v !== 1)) {
      return { ok: false, message: "The custom element may hold only 0 and 1." };
    }
    if (width % 2 === 0 || rows.length % 2 === 0) {
      return { ok: false, message: "The custom element needs an odd number of rows and columns." };
    }
    if (width > 15 || rows.length > 15) {
      return { ok: false, message: "The custom element can be at most 15 by 15." };
    }
    if (!rows.flat().includes(1)) {
      return { ok: false, message: "The custom element needs at least one 1." };
    }
    const element = {
      width,
      height: rows.length,
      anchorX: (width - 1) / 2,
      anchorY: (rows.length - 1) / 2,
      rows,
    };
    return { ok: true, element, shape };
  }
  const numbers = rest.map(Number);
  if (numbers.some((v) => !Number.isFinite(v))) {
    return { ok: false, message: "The sizes must be numbers." };
  }
  const [a = Number.NaN, b = Number.NaN] = numbers;
  const radius = (r: number) => isWhole(r) && r >= 1 && r <= MAX_RADIUS;
  const side = (n: number) => isWhole(n) && n >= 1 && n <= MAX_SIDE && n % 2 === 1;
  switch (shape) {
    case "disk":
      if (!radius(a))
        return {
          ok: false,
          message: `The disk radius must be a whole number from 1 to ${MAX_RADIUS}.`,
        };
      return { ok: true, shape, element: fromPredicate(a, a, (x, y) => x * x + y * y <= a * a) };
    case "diamond":
      if (!radius(a))
        return {
          ok: false,
          message: `The diamond radius must be a whole number from 1 to ${MAX_RADIUS}.`,
        };
      return {
        ok: true,
        shape,
        element: fromPredicate(a, a, (x, y) => Math.abs(x) + Math.abs(y) <= a),
      };
    case "cross":
      if (!radius(a))
        return {
          ok: false,
          message: `The cross arm must be a whole number from 1 to ${MAX_RADIUS}.`,
        };
      return { ok: true, shape, element: fromPredicate(a, a, (x, y) => x === 0 || y === 0) };
    case "rect":
      if (!side(a) || !side(b))
        return {
          ok: false,
          message: `The rectangle sides must be odd whole numbers from 1 to ${MAX_SIDE}.`,
        };
      return { ok: true, shape, element: fromPredicate((a - 1) / 2, (b - 1) / 2, () => true) };
    case "ellipse":
      if (!radius(a) || !radius(b))
        return {
          ok: false,
          message: `The ellipse half axes must be whole numbers from 1 to ${MAX_RADIUS}.`,
        };
      return {
        ok: true,
        shape,
        element: fromPredicate(a, b, (x, y) => (x / (a + 1)) ** 2 + (y / (b + 1)) ** 2 < 1),
      };
    case "line": {
      if (!side(a))
        return {
          ok: false,
          message: `The line length must be an odd whole number from 1 to ${MAX_SIDE}.`,
        };
      if (!Number.isFinite(b)) return { ok: false, message: "The line needs an angle in degrees." };
      const pixels = linePixels(a, b);
      const r = Math.max(...pixels.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
      const set = new Set(pixels.map(([x, y]) => `${x},${y}`));
      return { ok: true, shape, element: fromPredicate(r, r, (x, y) => set.has(`${x},${y}`)) };
    }
    default:
      return {
        ok: false,
        message: `Unknown shape "${name}". Use disk, rect, ellipse, cross, diamond, line or custom.`,
      };
  }
}

/** The element of a parameter value, or a 3 x 3 cross when the value is not valid. */
export function elementOf(text: string): StructuringElement {
  const parsed = parseStructuringElement(text);
  return parsed.ok ? parsed.element : fromPredicate(1, 1, (x, y) => x === 0 || y === 0);
}

/** The offsets (x, y) of the element, relative to the anchor. */
export function elementOffsets(element: StructuringElement): [number, number][] {
  const offsets: [number, number][] = [];
  element.rows.forEach((row, j) =>
    row.forEach((v, i) => {
      if (v) offsets.push([i - element.anchorX, j - element.anchorY]);
    }),
  );
  return offsets;
}

/** How far the element reaches from its anchor in any direction. */
export function elementReach(element: StructuringElement): number {
  return Math.max(
    element.anchorX,
    element.width - 1 - element.anchorX,
    element.anchorY,
    element.height - 1 - element.anchorY,
  );
}

/** The element turned by 180 degrees around its anchor, as dilation uses it. */
export function reflectElement(element: StructuringElement): StructuringElement {
  return {
    width: element.width,
    height: element.height,
    anchorX: element.width - 1 - element.anchorX,
    anchorY: element.height - 1 - element.anchorY,
    rows: [...element.rows].reverse().map((row) => [...row].reverse()),
  };
}
