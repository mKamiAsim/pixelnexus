/**
 * Pointer gestures of the selection tools. The viewport passes pointer events in image
 * coordinates, and a gesture answers with an outline to draw, a draft mask to show, or a
 * finished selection to commit. No React here, so the gestures are easy to test.
 *
 * As in Photoshop, Shift at the start of a gesture adds to the selection, Alt subtracts, and
 * both intersect. Otherwise the mode from the options bar applies. While you drag a marquee,
 * Shift makes a square or circle and Alt draws from the center.
 */
import type { Rect } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";
import {
  combineMasks,
  createMask,
  isMaskEmpty,
  type CombineMode,
  type Mask,
} from "@/core/mask/mask";
import { ellipseMask, paintStroke, polygonMask, rectMask, type Point } from "@/core/mask/raster";
import { featherMask } from "@/core/mask/refine";
import type { ColorSpace } from "@/core/selection/color";
import {
  boxAround,
  edgeMap,
  livePath,
  maxGradient,
  pathLength,
  strongestEdge,
  type Pixel,
} from "@/core/selection/livewire";
import { magicWand } from "@/core/selection/wand";

import type { SelectionToolId } from "./ids";

export interface Modifiers {
  readonly shift: boolean;
  readonly alt: boolean;
}

export interface Corners {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** What to draw over the image while a gesture runs, in image coordinates. */
export type Outline =
  | ({ readonly kind: "rect" | "ellipse" } & Corners)
  | {
      readonly kind: "path";
      readonly points: readonly Point[];
      readonly closed: boolean;
      /** A line from the last point to the pointer, for the polygonal lasso. */
      readonly rubber?: Point;
    };

export interface GestureContext {
  readonly image: RgbaImage;
  /** The active selection, or null. */
  readonly selection: Mask | null;
  readonly mode: CombineMode;
  /** Tool values, validated against the catalog. */
  readonly values: Params;
  /** Screen pixels per image pixel, for distances that should feel the same at any zoom. */
  readonly zoom: number;
  /** The tool's name, used as the history label. */
  readonly label: string;
}

export interface GestureUpdate {
  readonly outline?: Outline | null;
  readonly draft?: { readonly mask: Mask; readonly dirty: Rect | null } | null;
  /** A finished selection. Null deselects. */
  readonly commit?: { readonly mask: Mask | null; readonly label: string };
  /** The gesture is over. */
  readonly end?: boolean;
}

export interface Gesture {
  down(p: Point, mods: Modifiers): GestureUpdate;
  /** The pointer moved with the button held. */
  drag(p: Point, mods: Modifiers): GestureUpdate;
  up(p: Point, mods: Modifiers): GestureUpdate;
  /** The pointer moved with no button held, between clicks. */
  hover?(p: Point): GestureUpdate;
  doubleClick?(): GestureUpdate;
  /** A key while the gesture runs. Returns null for keys it does not use. */
  key?(key: string): GestureUpdate | null;
}

export function modeFor(mods: Modifiers, mode: CombineMode): CombineMode {
  if (mods.shift && mods.alt) return "intersect";
  if (mods.shift) return "add";
  if (mods.alt) return "subtract";
  return mode;
}

const num = (values: Params, key: string, fallback: number) => {
  const v = values[key];
  return typeof v === "number" ? v : fallback;
};

/**
 * Combine a new shape with the selection. In "new" mode an empty shape, from a click without a
 * drag, deselects. An empty result is no selection.
 */
export function finish(
  ctx: GestureContext,
  shape: Mask | null,
  mode: CombineMode,
  label = ctx.label,
): GestureUpdate {
  const feather = num(ctx.values, "feather", 0);
  const soft = shape && feather > 0 ? featherMask(shape, feather) : shape;
  if (!soft || isMaskEmpty(soft)) {
    if (mode === "new" || mode === "intersect") {
      return ctx.selection
        ? { commit: { mask: null, label: "Deselect" }, outline: null, end: true }
        : { outline: null, end: true };
    }
    return { outline: null, end: true };
  }
  const mask = combineMasks(ctx.selection, soft, mode);
  return {
    commit: { mask: isMaskEmpty(mask) ? null : mask, label },
    outline: null,
    end: true,
  };
}

/** Corners of a marquee from the start point and the pointer, on whole pixels. */
export function marqueeCorners(s: Point, p: Point, mods: Modifiers, values: Params): Corners {
  const style = values.style;
  if (style === "size") {
    const w = num(values, "sizeWidth", 64);
    const h = num(values, "sizeHeight", 64);
    const x0 = Math.round(mods.alt ? p.x - w / 2 : p.x);
    const y0 = Math.round(mods.alt ? p.y - h / 2 : p.y);
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  }
  const sign = (v: number) => (v < 0 ? -1 : 1);
  let dx = p.x - s.x;
  let dy = p.y - s.y;
  if (style === "ratio") {
    const ratio = num(values, "ratioHeight", 1) / num(values, "ratioWidth", 1);
    const w = Math.max(Math.abs(dx), Math.abs(dy) / ratio);
    dx = sign(dx) * w;
    dy = sign(dy) * w * ratio;
  } else if (mods.shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = sign(dx) * side;
    dy = sign(dy) * side;
  }
  const corners = mods.alt
    ? { x0: s.x - dx, y0: s.y - dy, x1: s.x + dx, y1: s.y + dy }
    : { x0: s.x, y0: s.y, x1: s.x + dx, y1: s.y + dy };
  return {
    x0: Math.round(corners.x0),
    y0: Math.round(corners.y0),
    x1: Math.round(corners.x1),
    y1: Math.round(corners.y1),
  };
}

function marquee(ctx: GestureContext, kind: "rect" | "ellipse"): Gesture {
  let start: Point = { x: 0, y: 0 };
  let mode: CombineMode = ctx.mode;
  const outline = (c: Corners): GestureUpdate => ({ outline: { kind, ...c } });
  const shape = (c: Corners) => {
    const { width, height } = ctx.image;
    if (c.x0 === c.x1 || c.y0 === c.y1) return null;
    return kind === "rect"
      ? rectMask(width, height, c, false)
      : ellipseMask(width, height, c, ctx.values.antiAlias !== false);
  };
  return {
    down(p, mods) {
      start = p;
      mode = modeFor(mods, ctx.mode);
      return outline(marqueeCorners(start, p, mods, ctx.values));
    },
    drag: (p, mods) => outline(marqueeCorners(start, p, mods, ctx.values)),
    up: (p, mods) => finish(ctx, shape(marqueeCorners(start, p, mods, ctx.values)), mode),
  };
}

function lasso(ctx: GestureContext): Gesture {
  const points: Point[] = [];
  let mode: CombineMode = ctx.mode;
  const minStep = 1 / ctx.zoom;
  const add = (p: Point) => {
    const last = points[points.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minStep) points.push(p);
  };
  const outline = (): GestureUpdate => ({
    outline: { kind: "path", points: [...points], closed: false },
  });
  return {
    down(p, mods) {
      mode = modeFor(mods, ctx.mode);
      points.length = 0;
      points.push(p);
      return outline();
    },
    drag(p) {
      add(p);
      return outline();
    },
    up(p) {
      add(p);
      const { width, height } = ctx.image;
      const antiAlias = ctx.values.antiAlias !== false;
      return finish(
        ctx,
        points.length >= 3 ? polygonMask(width, height, points, antiAlias) : null,
        mode,
      );
    },
  };
}

/** Screen pixels within which a click closes the polygon on its first point. */
const CLOSE_DISTANCE = 6;

function polygonLasso(ctx: GestureContext): Gesture {
  const points: Point[] = [];
  let mode: CombineMode = ctx.mode;
  let rubber: Point | undefined;
  const outline = (): GestureUpdate => ({
    outline: { kind: "path", points: [...points], closed: false, ...(rubber ? { rubber } : {}) },
  });
  const close = (): GestureUpdate => {
    const { width, height } = ctx.image;
    const antiAlias = ctx.values.antiAlias !== false;
    return finish(
      ctx,
      points.length >= 3 ? polygonMask(width, height, points, antiAlias) : null,
      mode,
    );
  };
  return {
    down(p, mods) {
      const first = points[0];
      if (!first) {
        mode = modeFor(mods, ctx.mode);
        points.push(p);
        return outline();
      }
      const near = Math.hypot(p.x - first.x, p.y - first.y) * ctx.zoom <= CLOSE_DISTANCE;
      if (near && points.length >= 3) return close();
      points.push(p);
      return outline();
    },
    drag(p) {
      rubber = p;
      return outline();
    },
    up: () => ({}),
    hover(p) {
      rubber = p;
      return outline();
    },
    doubleClick: () => close(),
    key(key) {
      if (key === "Enter") return close();
      if (key === "Escape") return { outline: null, end: true };
      if (key === "Backspace") {
        points.pop();
        return points.length ? outline() : { outline: null, end: true };
      }
      return null;
    },
  };
}

/**
 * The magnetic lasso. Click to start, then move the pointer: the path from the last anchor
 * follows the strongest edge within the width setting, by the live wire in
 * core/selection/livewire.ts. After the anchor spacing, an anchor is fixed by itself. Click to
 * fix one. Close on the first anchor, with a double-click or with Enter. Backspace removes the
 * last anchor and Escape cancels.
 */
/** Step cost of pixels that the closing path of the magnetic lasso may not use. */
const BLOCKED = 1e6;

function magneticLasso(ctx: GestureContext): Gesture {
  const { image } = ctx;
  const width = num(ctx.values, "width", 10);
  const contrast = num(ctx.values, "contrast", 10) / 100;
  const spacing = num(ctx.values, "spacing", 40);
  const margin = Math.max(24, 2 * width);
  /** The farthest the pointer gets from the last anchor before an anchor is set on the way. */
  const reach = Math.max(64, 2 * spacing);
  let gmax: number | null = null;
  let mode: CombineMode = ctx.mode;
  /** The fixed path, pixel by pixel, from the first anchor to the last one. */
  const fixed: Pixel[] = [];
  /** For each anchor, the length of `fixed` when it was set, to undo it with Backspace. */
  const anchors: number[] = [];
  let live: Pixel[] = [];

  const pixel = (p: Point): Pixel => ({
    x: Math.min(image.width - 1, Math.max(0, Math.floor(p.x))),
    y: Math.min(image.height - 1, Math.max(0, Math.floor(p.y))),
  });
  const center = (q: Pixel): Point => ({ x: q.x + 0.5, y: q.y + 0.5 });
  const last = () => fixed[fixed.length - 1] as Pixel;

  const mapAround = (a: Pixel, b: Pixel) => {
    gmax ??= maxGradient(image);
    return edgeMap(image, boxAround(image, a, b, margin + width), gmax, contrast);
  };
  /** The strongest edge within the width setting, or the pixel itself. */
  const snap = (q: Pixel) => strongestEdge(mapAround(q, q), q, width) ?? q;
  /** The live path from the last anchor to `to`, or to the strongest edge near it. */
  const wire = (to: Pixel, snapTo: boolean): Pixel[] => {
    const map = mapAround(last(), to);
    const target = (snapTo ? strongestEdge(map, to, width) : null) ?? to;
    return livePath(map, last(), target);
  };
  const fix = (path: Pixel[]) => {
    anchors.push(fixed.length);
    fixed.push(...path.slice(1));
    live = [];
  };
  const outline = (): GestureUpdate => {
    const points = [...fixed, ...live.slice(1)].map(center);
    const end = points[points.length - 1];
    return {
      outline: { kind: "path", points, closed: false, ...(end ? { rubber: end } : {}) },
    };
  };
  const follow = (p: Point): GestureUpdate => {
    if (fixed.length === 0) return {};
    const to = pixel(p);
    // A far move is walked in steps with an anchor after each, so every search stays small.
    for (;;) {
      const from = last();
      const d = Math.hypot(to.x - from.x, to.y - from.y);
      if (d <= reach) break;
      const step = wire(
        {
          x: Math.round(from.x + ((to.x - from.x) * reach) / d),
          y: Math.round(from.y + ((to.y - from.y) * reach) / d),
        },
        true,
      );
      if (step.length < 2) break;
      fix(step);
    }
    const path = wire(to, true);
    if (pathLength(path) > spacing && path.length > 1) fix(path);
    else live = path;
    return outline();
  };
  const close = (): GestureUpdate => {
    const first = fixed[0];
    if (!first) return { outline: null, end: true };
    // The way back may not use the pixels of the path so far. Without this rule it could run
    // back along the same edge, and the outline would have no inside.
    const map = mapAround(last(), first);
    const { box } = map;
    for (const q of fixed.slice(1, -1)) {
      const bx = q.x - box.x;
      const by = q.y - box.y;
      if (bx >= 0 && by >= 0 && bx < box.width && by < box.height) {
        map.cost[by * box.width + bx] = BLOCKED;
      }
    }
    const back = livePath(map, last(), first);
    const points = [...fixed, ...back.slice(1)].map(center);
    const antiAlias = ctx.values.antiAlias !== false;
    return finish(
      ctx,
      points.length >= 3 ? polygonMask(image.width, image.height, points, antiAlias) : null,
      mode,
    );
  };

  return {
    down(p, mods) {
      const first = fixed[0];
      if (!first) {
        mode = modeFor(mods, ctx.mode);
        fixed.push(snap(pixel(p)));
        anchors.push(0);
        return outline();
      }
      const start = center(first);
      const near = Math.hypot(p.x - start.x, p.y - start.y) * ctx.zoom <= CLOSE_DISTANCE;
      if (near && fixed.length >= 3) return close();
      fix(wire(pixel(p), true));
      return outline();
    },
    drag: (p) => follow(p),
    up: () => ({}),
    hover: (p) => follow(p),
    doubleClick: () => close(),
    key(key) {
      if (key === "Enter") return close();
      if (key === "Escape") return { outline: null, end: true };
      if (key === "Backspace") {
        const at = anchors.pop();
        if (at === undefined || at === 0) return { outline: null, end: true };
        fixed.length = at;
        live = [];
        return outline();
      }
      return null;
    },
  };
}

function brush(ctx: GestureContext, eraser: boolean): Gesture {
  const { width, height } = ctx.image;
  const stroke = createMask(width, height);
  const base = ctx.selection;
  const draft = createMask(width, height);
  if (base) draft.data.set(base.data);
  let subtract = eraser;
  let last: Point | null = null;
  const radius = num(ctx.values, "size", 30) / 2;
  const hardness = num(ctx.values, "hardness", 100) / 100;
  const paint = (points: Point[]): GestureUpdate => {
    const dirty = paintStroke(stroke, points, radius, hardness);
    if (dirty) {
      for (let y = dirty.y; y < dirty.y + dirty.height; y++) {
        for (let x = dirty.x; x < dirty.x + dirty.width; x++) {
          const i = y * width + x;
          const b = base?.data[i] ?? 0;
          const s = stroke.data[i] ?? 0;
          draft.data[i] = subtract ? Math.min(b, 255 - s) : Math.max(b, s);
        }
      }
    }
    return { draft: { mask: draft, dirty } };
  };
  return {
    down(p, mods) {
      subtract = eraser || mods.alt;
      last = p;
      return paint([p]);
    },
    drag(p) {
      const from = last ?? p;
      last = p;
      return paint([from, p]);
    },
    up() {
      if (isMaskEmpty(stroke)) return { draft: null, end: true };
      const mask = isMaskEmpty(draft) ? null : draft;
      if (!mask && !base) return { draft: null, end: true };
      return { draft: null, commit: { mask, label: ctx.label }, end: true };
    },
  };
}

function wand(ctx: GestureContext): Gesture {
  return {
    down(p, mods) {
      const mode = modeFor(mods, ctx.mode);
      const shape = magicWand(ctx.image, Math.floor(p.x), Math.floor(p.y), {
        tolerance: num(ctx.values, "tolerance", 32),
        contiguous: ctx.values.contiguous !== false,
        sampleSize: Number(ctx.values.sampleSize ?? 3),
        antiAlias: ctx.values.antiAlias !== false,
        colorSpace: (ctx.values.colorSpace ?? "rgb") as ColorSpace,
      });
      return finish(ctx, shape, mode);
    },
    drag: () => ({}),
    up: () => ({}),
  };
}

/** The gesture for a tool, or null for tools that have no canvas gesture yet. */
export function createGesture(tool: SelectionToolId, ctx: GestureContext): Gesture | null {
  switch (tool) {
    case "marquee-rect":
      return marquee(ctx, "rect");
    case "marquee-ellipse":
      return marquee(ctx, "ellipse");
    case "lasso":
      return lasso(ctx);
    case "lasso-polygon":
      return polygonLasso(ctx);
    case "lasso-magnetic":
      return magneticLasso(ctx);
    case "brush-select":
      return brush(ctx, false);
    case "eraser-select":
      return brush(ctx, true);
    case "magic-wand":
      return wand(ctx);
    default:
      return null;
  }
}
