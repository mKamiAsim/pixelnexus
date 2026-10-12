import { describe, expect, it } from "vitest";

import { composite } from "@/core/composite/compose";
import { createImage } from "@/core/image/types";

import { squaredDistance } from "./distance";
import {
  combineMasks,
  createMask,
  cropMask,
  invertMask,
  maskBounds,
  maskFromAlpha,
  maskFromLuminance,
  maskStats,
  maskToImage,
  masksEqual,
  selectAll,
  thresholdMask,
  type Mask,
} from "./mask";
import { ellipseMask, paintStroke, polygonMask, rectMask, type Point } from "./raster";
import { borderMask, featherMask, growMask, shrinkMask, smoothMask } from "./refine";

const fromRows = (rows: string[]): Mask => {
  const mask = createMask(rows[0]?.length ?? 1, rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => (mask.data[y * mask.width + x] = c === "#" ? 255 : 0)),
  );
  return mask;
};
const toRows = (mask: Mask): string[] =>
  Array.from({ length: mask.height }, (_, y) =>
    Array.from({ length: mask.width }, (_, x) =>
      (mask.data[y * mask.width + x] ?? 0) >= 128 ? "#" : ".",
    ).join(""),
  );
const count = (mask: Mask) => mask.data.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
const area = (mask: Mask) => mask.data.reduce((n, v) => n + v, 0) / 255;

describe("combining masks", () => {
  const a = fromRows(["##..", "##..", "....", "...."]);
  const b = fromRows([".##.", ".##.", ".##.", "...."]);

  it("gives the usual set operations on hard masks", () => {
    expect(toRows(combineMasks(a, b, "add"))).toEqual(["###.", "###.", ".##.", "...."]);
    expect(toRows(combineMasks(a, b, "subtract"))).toEqual(["#...", "#...", "....", "...."]);
    expect(toRows(combineMasks(a, b, "intersect"))).toEqual([".#..", ".#..", "....", "...."]);
    expect(combineMasks(a, b, "new")).toBe(b);
  });

  it("uses the larger, smaller and complement values on soft masks", () => {
    const x = createMask(1, 1, 200);
    const y = createMask(1, 1, 100);
    expect(combineMasks(x, y, "add").data[0]).toBe(200);
    expect(combineMasks(x, y, "intersect").data[0]).toBe(100);
    expect(combineMasks(x, y, "subtract").data[0]).toBe(155);
  });

  it("handles a missing current selection", () => {
    expect(combineMasks(null, b, "add")).toBe(b);
    expect(count(combineMasks(null, b, "subtract"))).toBe(0);
    expect(count(combineMasks(null, b, "intersect"))).toBe(0);
  });

  it("inverts, and inverting twice gives the same mask", () => {
    expect(toRows(invertMask(a))[0]).toBe("..##");
    expect(masksEqual(invertMask(invertMask(a)), a)).toBe(true);
  });
});

describe("mask facts and conversions", () => {
  it("finds the bounds and the selected area", () => {
    const mask = fromRows(["....", ".#..", ".##.", "...."]);
    mask.data[0] = 51;
    expect(maskBounds(mask)).toEqual({ x: 0, y: 0, width: 3, height: 3 });
    const stats = maskStats(mask);
    expect(stats.touched).toBe(4);
    expect(stats.area).toBeCloseTo(3.2, 10);
    expect(stats.soft).toBe(true);
    expect(maskBounds(createMask(3, 3))).toBeNull();
  });

  it("reads alpha and brightness, and writes a gray image", () => {
    const image = createImage(2, 1);
    image.data.set([255, 255, 255, 10, 0, 0, 255, 200]);
    expect([...maskFromAlpha(image).data]).toEqual([10, 200]);
    // Luma of pure blue is 0.0722 * 255 = 18.4.
    expect([...maskFromLuminance(image).data]).toEqual([255, 18]);
    const mask = createMask(2, 1);
    mask.data.set([7, 250]);
    expect(masksEqual(maskFromLuminance(maskToImage(mask)), mask)).toBe(true);
  });

  it("crops, thresholds and selects all", () => {
    const mask = fromRows(["#...", ".#..", "..#.", "...#"]);
    expect(toRows(cropMask(mask, { x: 1, y: 1, width: 2, height: 2 }))).toEqual(["#.", ".#"]);
    const soft = createMask(2, 1);
    soft.data.set([127, 128]);
    expect([...thresholdMask(soft).data]).toEqual([0, 255]);
    expect(count(selectAll(3, 2))).toBe(6);
  });
});

describe("shapes", () => {
  it("fills whole-pixel rectangles exactly, in any corner order", () => {
    const mask = rectMask(10, 10, { x0: 7, y0: 6, x1: 2, y1: 3 });
    expect(count(mask)).toBe(15);
    expect(maskBounds(mask)).toEqual({ x: 2, y: 3, width: 5, height: 3 });
    expect(mask.data.every((v) => v === 0 || v === 255)).toBe(true);
  });

  it("gives edge pixels their covered part", () => {
    const mask = rectMask(4, 1, { x0: 0.5, y0: 0, x1: 2.25, y1: 1 });
    expect([...mask.data]).toEqual([128, 255, 64, 0]);
    const hard = rectMask(4, 1, { x0: 0.5, y0: 0, x1: 2.25, y1: 1 }, false);
    expect([...hard.data]).toEqual([255, 255, 0, 0]);
  });

  it("draws an ellipse with the right area", () => {
    const mask = ellipseMask(100, 60, { x0: 10, y0: 10, x1: 90, y1: 50 });
    expect(area(mask) / (Math.PI * 40 * 20)).toBeCloseTo(1, 2);
    const hard = ellipseMask(100, 60, { x0: 10, y0: 10, x1: 90, y1: 50 }, false);
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 100; x++) {
        const inside = ((x + 0.5 - 50) / 40) ** 2 + ((y + 0.5 - 30) / 20) ** 2 < 1;
        expect(hard.data[y * 100 + x]).toBe(inside ? 255 : 0);
      }
    }
  });

  it("fills a polygon like the rectangle it describes, in either direction", () => {
    const square: Point[] = [
      { x: 2, y: 3 },
      { x: 8, y: 3 },
      { x: 8, y: 7 },
      { x: 2, y: 7 },
    ];
    const rect = rectMask(10, 10, { x0: 2, y0: 3, x1: 8, y1: 7 });
    expect(masksEqual(polygonMask(10, 10, square), rect)).toBe(true);
    expect(masksEqual(polygonMask(10, 10, [...square].reverse()), rect)).toBe(true);
    // Going around twice still counts as inside with the nonzero rule.
    expect(masksEqual(polygonMask(10, 10, [...square, ...square]), rect)).toBe(true);
  });

  it("measures a triangle's area and tests pixel centers without anti-aliasing", () => {
    const triangle: Point[] = [
      { x: 5, y: 5 },
      { x: 55, y: 5 },
      { x: 5, y: 45 },
    ];
    expect(area(polygonMask(60, 50, triangle)) / (0.5 * 50 * 40)).toBeCloseTo(1, 2);
    const hard = polygonMask(60, 50, triangle, false);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 60; x++) {
        // Inside the triangle: right of x = 5, below y = 5, and below the slanted side.
        const s = (x + 0.5 - 5) / 50 + (y + 0.5 - 5) / 40;
        if (Math.abs(s - 1) < 1e-9) continue;
        const inside = x + 0.5 > 5 && y + 0.5 > 5 && s < 1;
        expect(hard.data[y * 60 + x]).toBe(inside ? 255 : 0);
      }
    }
  });

  it("paints a round brush dab and keeps the larger value", () => {
    const mask = createMask(21, 21);
    const changed = paintStroke(mask, [{ x: 10.5, y: 10.5 }], 5, 1);
    expect(changed).toEqual({ x: 5, y: 5, width: 11, height: 11 });
    expect(mask.data[10 * 21 + 10]).toBe(255);
    expect(area(mask) / (Math.PI * 25)).toBeCloseTo(1, 1);
    const soft = createMask(21, 21);
    paintStroke(soft, [{ x: 10.5, y: 10.5 }], 5, 0);
    expect(soft.data[10 * 21 + 10]).toBe(255);
    expect(soft.data[10 * 21 + 13] ?? 0).toBeLessThan(255);
    // Painting again with a softer brush never lowers a value.
    const before = mask.data.slice();
    paintStroke(mask, [{ x: 10.5, y: 10.5 }], 5, 0);
    expect(mask.data.every((v, i) => v >= (before[i] ?? 0))).toBe(true);
  });

  it("paints along a line", () => {
    const mask = createMask(40, 10);
    paintStroke(
      mask,
      [
        { x: 5, y: 5 },
        { x: 35, y: 5 },
      ],
      2,
      1,
    );
    // Pixel centers in row 5 sit 0.5 below the line. Pixels 3 to 36 are within the radius.
    expect(toRows(mask)[5]).toBe("..." + "#".repeat(34) + "...");
  });
});

describe("distance transform", () => {
  it("matches a brute-force search", () => {
    const width = 23;
    const height = 17;
    const points = [
      [3, 4],
      [20, 1],
      [11, 15],
      [0, 16],
    ];
    const set = new Set(points.map(([x, y]) => (y ?? 0) * width + (x ?? 0)));
    const d2 = squaredDistance(width, height, (i) => set.has(i));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const best = Math.min(
          ...points.map(([px, py]) => (x - (px ?? 0)) ** 2 + (y - (py ?? 0)) ** 2),
        );
        expect(d2[y * width + x]).toBe(best);
      }
    }
  });
});

describe("refining a selection", () => {
  it("grows a single pixel into a disk of the given radius", () => {
    const mask = createMask(9, 9);
    mask.data[4 * 9 + 4] = 255;
    // Pixels within 2: the center, 4 at distance 1, 4 at sqrt 2, 4 at 2.
    expect(count(growMask(mask, 2))).toBe(13);
  });

  it("shrinks a square by one pixel on each side", () => {
    const mask = rectMask(9, 9, { x0: 2, y0: 2, x1: 7, y1: 7 });
    expect(maskBounds(shrinkMask(mask, 1))).toEqual({ x: 3, y: 3, width: 3, height: 3 });
    const all = selectAll(9, 9);
    expect(count(shrinkMask(all, 2))).toBe(81);
    expect(maskBounds(shrinkMask(all, 2, true))).toEqual({ x: 2, y: 2, width: 5, height: 5 });
  });

  it("makes a border band half inside and half outside", () => {
    const mask = rectMask(20, 20, { x0: 5, y0: 5, x1: 15, y1: 15 });
    const band = borderMask(mask, 2);
    // Inside: the outer ring of the 10x10 square, 36 pixels. Outside: the 40 pixels next to it.
    expect(count(band)).toBe(76);
    expect(band.data[10 * 20 + 10]).toBe(0);
  });

  it("removes specks and keeps solid areas when smoothing", () => {
    const mask = fromRows([
      "#.........",
      "..........",
      "...####...",
      "...####...",
      "...####...",
      "...####...",
      "..........",
      ".........#",
    ]);
    const smooth = toRows(smoothMask(mask, 1));
    expect(smooth[0]?.[0]).toBe(".");
    expect(smooth[7]?.[9]).toBe(".");
    expect(smooth[3]).toBe("...####...");
  });

  it("feathers an edge symmetrically and keeps the selected area", () => {
    const mask = rectMask(80, 4, { x0: 40, y0: 0, x1: 80, y1: 4 });
    const soft = featherMask(mask, 8);
    const row = [...soft.data.subarray(0, 80)];
    expect(row[0]).toBe(0);
    expect(row[79]).toBe(255);
    for (let x = 1; x < 80; x++) expect(row[x] ?? 0).toBeGreaterThanOrEqual(row[x - 1] ?? 0);
    for (let k = 0; k < 20; k++)
      expect((row[39 - k] ?? 0) + (row[40 + k] ?? 0)).toBeCloseTo(255, -0.5);
    expect(area(soft)).toBeCloseTo(area(mask), -1);
    expect(featherMask(mask, 0)).toBe(mask);
  });

  it("blends through a feathered mask within 1/255 of the formula", () => {
    const width = 64;
    const height = 8;
    const original = createImage(width, height);
    const filtered = createImage(width, height);
    for (let i = 0; i < width * height; i++) {
      original.data.set([20, 200, 90, 255], i * 4);
      filtered.data.set([240, 10, 160, 255], i * 4);
    }
    const mask = featherMask(rectMask(width, height, { x0: 32, y0: 0, x1: 64, y1: 8 }), 10);
    const out = composite(original, filtered, { x: 0, y: 0, width, height }, mask);
    for (let i = 0; i < width * height; i++) {
      const alpha = (mask.data[i] ?? 0) / 255;
      for (let c = 0; c < 4; c++) {
        const expected =
          alpha * (filtered.data[i * 4 + c] ?? 0) + (1 - alpha) * (original.data[i * 4 + c] ?? 0);
        expect(Math.abs((out.data[i * 4 + c] ?? 0) - expected)).toBeLessThanOrEqual(1);
      }
    }
  });
});
