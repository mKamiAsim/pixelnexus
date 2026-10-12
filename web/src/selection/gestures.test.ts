import { describe, expect, it } from "vitest";

import { createImage } from "@/core/image/types";
import { maskBounds, maskStats } from "@/core/mask/mask";
import { rectMask } from "@/core/mask/raster";

import { createGesture, marqueeCorners, modeFor, type GestureContext } from "./gestures";

const none = { shift: false, alt: false };
const rectMaskOf = (w: number, h: number, x0: number, y0: number, x1: number, y1: number) =>
  rectMask(w, h, { x0, y0, x1, y1 });
const image = createImage(40, 30);
const ctx = (over: Partial<GestureContext> = {}): GestureContext => ({
  image,
  selection: null,
  mode: "new",
  values: {},
  zoom: 1,
  label: "Tool",
  ...over,
});
const gesture = (tool: Parameters<typeof createGesture>[0], c = ctx()) => {
  const g = createGesture(tool, c);
  if (!g) throw new Error(`no gesture for ${tool}`);
  return g;
};

describe("modes and marquee geometry", () => {
  it("reads the mode from Shift and Alt like Photoshop", () => {
    expect(modeFor(none, "new")).toBe("new");
    expect(modeFor({ shift: true, alt: false }, "new")).toBe("add");
    expect(modeFor({ shift: false, alt: true }, "add")).toBe("subtract");
    expect(modeFor({ shift: true, alt: true }, "new")).toBe("intersect");
  });

  it("snaps to whole pixels, makes squares with Shift and draws from the center with Alt", () => {
    const s = { x: 10.4, y: 10.6 };
    expect(marqueeCorners(s, { x: 20.2, y: 14.4 }, none, {})).toEqual({
      x0: 10,
      y0: 11,
      x1: 20,
      y1: 14,
    });
    expect(marqueeCorners(s, { x: 20.4, y: 14.6 }, { shift: true, alt: false }, {})).toEqual({
      x0: 10,
      y0: 11,
      x1: 20,
      y1: 21,
    });
    expect(
      marqueeCorners({ x: 10, y: 10 }, { x: 14, y: 12 }, { shift: false, alt: true }, {}),
    ).toEqual({
      x0: 6,
      y0: 8,
      x1: 14,
      y1: 12,
    });
  });

  it("keeps a fixed ratio and places a fixed size", () => {
    const ratio = { style: "ratio", ratioWidth: 2, ratioHeight: 1 };
    expect(marqueeCorners({ x: 0, y: 0 }, { x: 10, y: 2 }, none, ratio)).toEqual({
      x0: 0,
      y0: 0,
      x1: 10,
      y1: 5,
    });
    const size = { style: "size", sizeWidth: 8, sizeHeight: 4 };
    expect(marqueeCorners({ x: 0, y: 0 }, { x: 5, y: 5 }, none, size)).toEqual({
      x0: 5,
      y0: 5,
      x1: 13,
      y1: 9,
    });
  });
});

describe("selection gestures", () => {
  it("selects a rectangle, and a click without a drag deselects", () => {
    const g = gesture("marquee-rect");
    g.down({ x: 2, y: 3 }, none);
    expect(g.drag({ x: 12, y: 8 }, none).outline).toEqual({
      kind: "rect",
      x0: 2,
      y0: 3,
      x1: 12,
      y1: 8,
    });
    const done = g.up({ x: 12, y: 8 }, none);
    expect(done.end).toBe(true);
    const mask = done.commit?.mask ?? null;
    expect(mask && maskBounds(mask)).toEqual({ x: 2, y: 3, width: 10, height: 5 });
    expect(done.commit?.label).toBe("Tool");

    const selected = rectMaskOf(40, 30, 0, 0, 5, 5);
    const click = gesture("marquee-rect", ctx({ selection: selected }));
    click.down({ x: 20, y: 20 }, none);
    expect(click.up({ x: 20.2, y: 20.1 }, none).commit).toEqual({ mask: null, label: "Deselect" });
  });

  it("adds with Shift and subtracts with Alt", () => {
    const selected = rectMaskOf(40, 30, 0, 0, 10, 10);
    const add = gesture("marquee-rect", ctx({ selection: selected }));
    add.down({ x: 20, y: 0 }, { shift: true, alt: false });
    const added = add.up({ x: 30, y: 10 }, { shift: false, alt: false }).commit?.mask;
    expect(added && maskStats(added).area).toBe(200);
    const sub = gesture("marquee-rect", ctx({ selection: selected }));
    sub.down({ x: 0, y: 0 }, { shift: false, alt: true });
    const left = sub.up({ x: 5, y: 10 }, { shift: false, alt: true }).commit?.mask;
    expect(left && maskBounds(left)).toEqual({ x: 5, y: 0, width: 5, height: 10 });
  });

  it("feathers the new shape before combining", () => {
    const g = gesture("marquee-ellipse", ctx({ values: { feather: 3, antiAlias: true } }));
    g.down({ x: 10, y: 5 }, none);
    const mask = g.up({ x: 30, y: 25 }, none).commit?.mask;
    expect(mask && maskStats(mask).soft).toBe(true);
  });

  it("closes a freehand lasso into a polygon", () => {
    const g = gesture("lasso");
    g.down({ x: 5, y: 5 }, none);
    g.drag({ x: 25, y: 5 }, none);
    g.drag({ x: 25, y: 15 }, none);
    const mask = g.up({ x: 5, y: 15 }, none).commit?.mask;
    expect(mask && maskBounds(mask)).toEqual({ x: 5, y: 5, width: 20, height: 10 });
  });

  it("adds polygon points by clicks, removes one with Backspace and closes on the first point", () => {
    const g = gesture("lasso-polygon", ctx({ zoom: 2 }));
    g.down({ x: 5, y: 5 }, none);
    g.down({ x: 25, y: 5 }, none);
    g.down({ x: 30, y: 30 }, none);
    expect(g.key?.("Backspace")?.outline).toMatchObject({ points: [{ x: 5 }, { x: 25 }] });
    g.down({ x: 25, y: 15 }, none);
    g.down({ x: 5, y: 15 }, none);
    expect(g.hover?.({ x: 6, y: 9 }).outline).toMatchObject({ rubber: { x: 6, y: 9 } });
    // 2 screen pixels from the first point at 200% zoom.
    const done = g.down({ x: 5.5, y: 5.5 }, none);
    expect(done.end).toBe(true);
    const mask = done.commit?.mask;
    expect(mask && maskBounds(mask)).toEqual({ x: 5, y: 5, width: 20, height: 10 });
    expect(g.key?.("a")).toBeNull();
  });

  it("paints with the brush and erases with the eraser", () => {
    const brush = gesture("brush-select", ctx({ values: { size: 6, hardness: 100 } }));
    expect(brush.down({ x: 10, y: 10 }, none).draft?.dirty).not.toBeNull();
    brush.drag({ x: 30, y: 10 }, none);
    const painted = brush.up({ x: 30, y: 10 }, none).commit?.mask ?? null;
    expect(painted && maskBounds(painted)).toEqual({ x: 7, y: 7, width: 26, height: 6 });

    const eraser = gesture(
      "eraser-select",
      ctx({ selection: painted, values: { size: 6, hardness: 100 } }),
    );
    eraser.down({ x: 20, y: 10 }, none);
    const erased = eraser.up({ x: 20, y: 10 }, none).commit?.mask ?? null;
    expect(erased && maskStats(erased).area).toBeLessThan(painted ? maskStats(painted).area : 0);
  });

  it("selects by color with the Magic Wand in one click", () => {
    const scene = createImage(10, 10);
    for (let i = 0; i < 100; i++)
      scene.data.set(i % 10 < 5 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    const g = gesture(
      "magic-wand",
      ctx({
        image: scene,
        values: { tolerance: 10, contiguous: true, sampleSize: "1", antiAlias: false },
      }),
    );
    const done = g.down({ x: 1.5, y: 1.5 }, none);
    expect(done.end).toBe(true);
    const mask = done.commit?.mask;
    expect(mask && maskBounds(mask)).toEqual({ x: 0, y: 0, width: 5, height: 10 });
  });

  it("follows the edges of a square with the magnetic lasso", () => {
    // A dark square from (10, 8) to (30, 22) on a light background.
    const picture = createImage(40, 30);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        const v = x >= 10 && x < 30 && y >= 8 && y < 22 ? 30 : 220;
        picture.data.set([v, v, v, 255], (y * 40 + x) * 4);
      }
    }
    const g = gesture(
      "lasso-magnetic",
      ctx({ image: picture, values: { width: 4, contrast: 10, spacing: 200 } }),
    );
    // Click near three corners, a little off the edge. The path snaps to the edge.
    g.down({ x: 11.5, y: 6.5 }, none);
    g.hover?.({ x: 29, y: 6.5 });
    g.down({ x: 29, y: 6.5 }, none);
    g.hover?.({ x: 31.5, y: 21 });
    g.down({ x: 31.5, y: 21 }, none);
    const done = g.key?.("Enter");
    const mask = done?.commit?.mask;
    if (!mask) throw new Error("expected a selection");
    const bounds = maskBounds(mask);
    // The outline runs along the edge pixels, so the selection is the square give or take one
    // pixel on each side.
    expect(bounds?.x).toBeGreaterThanOrEqual(8);
    expect(bounds?.x).toBeLessThanOrEqual(10);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeGreaterThanOrEqual(30);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(32);
    expect(maskStats(mask).area).toBeGreaterThan(20 * 14 * 0.8);
    expect(maskStats(mask).area).toBeLessThan(22 * 16);
    // Backspace takes back the last anchor, and Escape ends the gesture.
    const again = gesture("lasso-magnetic", ctx({ image: picture }));
    again.down({ x: 11, y: 7 }, none);
    again.down({ x: 29, y: 7 }, none);
    const back = again.key?.("Backspace");
    expect(back?.outline?.kind === "path" ? back.outline.points.length : 0).toBe(1);
    expect(again.key?.("Escape")).toEqual({ outline: null, end: true });
  });
});
