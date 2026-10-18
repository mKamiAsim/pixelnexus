/**
 * Turn shapes into masks: rectangles, ellipses, polygons and brush strokes.
 *
 * Coordinates are image pixels as continuous numbers. Pixel (i, j) covers the square from
 * (i, j) to (i + 1, j + 1), so its center is (i + 0.5, j + 0.5).
 *
 * Without anti-aliasing, a pixel is selected when its center is inside the shape. With
 * anti-aliasing, the value is the covered part of the pixel: exact for rectangles, and measured
 * on 4 sample rows per pixel with exact horizontal coverage for ellipses and polygons.
 */
import { createMask, type Mask } from "./mask";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Sample rows per pixel for anti-aliased edges. */
const SUBROWS = 4;

/**
 * Fill a mask from horizontal spans. `spansAt(y)` returns sorted pairs [x0, x1, x0, x1, ...]
 * of the shape's inside at height y.
 */
function fromSpans(
  width: number,
  height: number,
  top: number,
  bottom: number,
  antiAlias: boolean,
  spansAt: (y: number) => readonly number[],
): Mask {
  const mask = createMask(width, height);
  const j0 = Math.max(0, Math.floor(top));
  const j1 = Math.min(height, Math.ceil(bottom));
  const rows = antiAlias ? SUBROWS : 1;
  const coverage = new Float64Array(width + 1);
  const runs = new Float64Array(width + 1);
  for (let j = j0; j < j1; j++) {
    coverage.fill(0);
    runs.fill(0);
    for (let s = 0; s < rows; s++) {
      const spans = spansAt(j + (s + 0.5) / rows);
      for (let k = 0; k + 1 < spans.length; k += 2) {
        const x0 = Math.max(0, spans[k] ?? 0);
        const x1 = Math.min(width, spans[k + 1] ?? 0);
        if (x1 <= x0) continue;
        if (!antiAlias) {
          // Pixels whose center lies in [x0, x1).
          const i0 = Math.ceil(x0 - 0.5);
          const i1 = Math.ceil(x1 - 0.5);
          if (i1 > i0) {
            runs[i0] = (runs[i0] ?? 0) + 1;
            runs[i1] = (runs[i1] ?? 0) - 1;
          }
          continue;
        }
        const w = 1 / rows;
        const i0 = Math.floor(x0);
        const i1 = Math.floor(x1);
        if (i0 === i1) {
          coverage[i0] = (coverage[i0] ?? 0) + (x1 - x0) * w;
          continue;
        }
        coverage[i0] = (coverage[i0] ?? 0) + (i0 + 1 - x0) * w;
        if (i1 > i0 + 1) {
          runs[i0 + 1] = (runs[i0 + 1] ?? 0) + w;
          runs[i1] = (runs[i1] ?? 0) - w;
        }
        if (i1 < width) coverage[i1] = (coverage[i1] ?? 0) + (x1 - i1) * w;
      }
    }
    let run = 0;
    const row = j * width;
    for (let i = 0; i < width; i++) {
      run += runs[i] ?? 0;
      const value = Math.min(1, Math.max(0, run + (coverage[i] ?? 0)));
      mask.data[row + i] = Math.round(value * 255);
    }
  }
  return mask;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** A rectangle from (x0, y0) to (x1, y1). Corners may be given in any order. */
export function rectMask(
  width: number,
  height: number,
  corners: { x0: number; y0: number; x1: number; y1: number },
  antiAlias = true,
): Mask {
  const x0 = Math.min(corners.x0, corners.x1);
  const x1 = Math.max(corners.x0, corners.x1);
  const y0 = Math.min(corners.y0, corners.y1);
  const y1 = Math.max(corners.y0, corners.y1);
  const mask = createMask(width, height);
  const i0 = Math.max(0, Math.floor(x0));
  const i1 = Math.min(width, Math.ceil(x1));
  const j0 = Math.max(0, Math.floor(y0));
  const j1 = Math.min(height, Math.ceil(y1));
  for (let j = j0; j < j1; j++) {
    const cy = antiAlias ? overlap(j, j + 1, y0, y1) : j + 0.5 >= y0 && j + 0.5 < y1 ? 1 : 0;
    if (cy === 0) continue;
    for (let i = i0; i < i1; i++) {
      const cx = antiAlias ? overlap(i, i + 1, x0, x1) : i + 0.5 >= x0 && i + 0.5 < x1 ? 1 : 0;
      mask.data[j * width + i] = Math.round(cx * cy * 255);
    }
  }
  return mask;
}

/** The ellipse that fits in the rectangle from (x0, y0) to (x1, y1). */
export function ellipseMask(
  width: number,
  height: number,
  corners: { x0: number; y0: number; x1: number; y1: number },
  antiAlias = true,
): Mask {
  const x0 = Math.min(corners.x0, corners.x1);
  const x1 = Math.max(corners.x0, corners.x1);
  const y0 = Math.min(corners.y0, corners.y1);
  const y1 = Math.max(corners.y0, corners.y1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const a = (x1 - x0) / 2;
  const b = (y1 - y0) / 2;
  if (a <= 0 || b <= 0) return createMask(width, height);
  return fromSpans(width, height, y0, y1, antiAlias, (y) => {
    const t = (y - cy) / b;
    if (t <= -1 || t >= 1) return [];
    const half = a * Math.sqrt(1 - t * t);
    return [cx - half, cx + half];
  });
}

interface Edge {
  readonly top: number;
  readonly bottom: number;
  readonly x: number;
  readonly slope: number;
  /** +1 for an edge that goes down, -1 for one that goes up. */
  readonly winding: number;
}

/**
 * A closed polygon, filled with the nonzero winding rule: a point is inside when the outline
 * winds around it at least once. So a lasso path that crosses itself keeps both loops.
 */
export function polygonMask(
  width: number,
  height: number,
  points: readonly Point[],
  antiAlias = true,
): Mask {
  if (points.length < 3) return createMask(width, height);
  const edges: Edge[] = [];
  let top = Infinity;
  let bottom = -Infinity;
  for (let k = 0; k < points.length; k++) {
    const p = points[k] as Point;
    const q = points[(k + 1) % points.length] as Point;
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
    if (p.y === q.y) continue;
    const down = q.y > p.y;
    const a = down ? p : q;
    const b = down ? q : p;
    edges.push({
      top: a.y,
      bottom: b.y,
      x: a.x,
      slope: (b.x - a.x) / (b.y - a.y),
      winding: down ? 1 : -1,
    });
  }
  edges.sort((e, f) => e.top - f.top);
  let next = 0;
  let active: Edge[] = [];
  let lastY = -Infinity;
  const crossings: { x: number; w: number }[] = [];
  return fromSpans(width, height, top, bottom, antiAlias, (y) => {
    // Sample rows come in increasing order, so the active edge list only moves forward.
    if (y < lastY) {
      next = 0;
      active = [];
    }
    lastY = y;
    while (next < edges.length && (edges[next] as Edge).top <= y)
      active.push(edges[next++] as Edge);
    active = active.filter((e) => e.bottom > y);
    crossings.length = 0;
    for (const e of active) {
      if (e.top <= y) crossings.push({ x: e.x + (y - e.top) * e.slope, w: e.winding });
    }
    crossings.sort((c, d) => c.x - d.x);
    const spans: number[] = [];
    let wind = 0;
    for (const c of crossings) {
      const before = wind;
      wind += c.w;
      if (before === 0 && wind !== 0) spans.push(c.x);
      else if (before !== 0 && wind === 0) spans.push(c.x);
    }
    return spans;
  });
}

/** Distance from point (px, py) to the segment from a to b. */
function segmentDistance(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / length2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/**
 * The value of a round brush at distance d from its center line. Hardness 1 gives a hard edge
 * with one pixel of anti-aliasing. Lower hardness widens the soft edge inward: the value falls
 * from 1 at radius * hardness to 0 at the radius, with a smoothstep curve.
 */
export function brushValue(d: number, radius: number, hardness: number): number {
  const edge = Math.max(0.5, radius * (1 - hardness));
  const t = Math.min(1, Math.max(0, (radius - d) / edge));
  return hardness >= 1 ? Math.min(1, Math.max(0, radius - d + 0.5)) : t * t * (3 - 2 * t);
}

/**
 * Paint a stroke along `points` into `into`, keeping the larger value at each pixel. Returns the
 * changed rectangle, or null when nothing changed.
 */
export function paintStroke(
  into: Mask,
  points: readonly Point[],
  radius: number,
  hardness: number,
): { x: number; y: number; width: number; height: number } | null {
  if (points.length === 0 || radius <= 0) return null;
  const { width, height, data } = into;
  const segments = points.length === 1 ? [[points[0], points[0]]] : [];
  for (let k = 0; k + 1 < points.length; k++) segments.push([points[k], points[k + 1]]);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (const [a, b] of segments as [Point, Point][]) {
    const i0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 1));
    const i1 = Math.min(width, Math.ceil(Math.max(a.x, b.x) + radius + 1));
    const j0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 1));
    const j1 = Math.min(height, Math.ceil(Math.max(a.y, b.y) + radius + 1));
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const d = segmentDistance(i + 0.5, j + 0.5, a, b);
        if (d >= radius + 0.5) continue;
        const v = Math.round(brushValue(d, radius, hardness) * 255);
        const at = j * width + i;
        if (v > (data[at] ?? 0)) {
          data[at] = v;
          if (i < x0) x0 = i;
          if (i > x1) x1 = i;
          if (j < y0) y0 = j;
          if (j > y1) y1 = j;
        }
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
