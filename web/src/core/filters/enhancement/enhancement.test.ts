import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";

import { applyCurves, clipHistogram, curveAt, tileCurves } from "./clahe";
import { applyTable, equalizeTable, histogram256, histogramPercentile } from "./histogram";
import { posterizeTransfer, stretchTransfer } from "./point-ops";
import { grayWorldFilter, whiteBalanceFilter } from "./white-balance";

const CONTEXT = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;

/** numpy.percentile with its default linear rule, on a plain array. */
function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const h = ((sorted.length - 1) * q) / 100;
  const i = Math.floor(h);
  const a = sorted[i] ?? 0;
  return a + (h - i) * ((sorted[Math.min(i + 1, sorted.length - 1)] ?? a) - a);
}

describe("histogram point operations", () => {
  const values = Array.from({ length: 401 }, (_, i) => (i * 37 + (i % 7) * 11) % 256);
  const plane = createPlane(401, 1);
  values.forEach((v, i) => (plane.data[i] = v));
  const counts = histogram256(plane);

  it("finds the same percentiles as the linear rule of numpy.percentile", () => {
    for (const q of [0, 0.5, 1, 25, 33.3, 50, 99.5, 100]) {
      expect(histogramPercentile(counts, q)).toBeCloseTo(percentile(values, q), 10);
    }
  });

  it("rounds values to levels when counting, and interpolates when applying", () => {
    const p = createPlane(3, 1);
    p.data.set([10.4, 10.6, 300]);
    const h = histogram256(p);
    expect([h[10], h[11], h[255]]).toEqual([1, 1, 1]);
    const table = Float64Array.from({ length: 256 }, (_, k) => 2 * k);
    expect(Array.from(applyTable(p, table).data)).toEqual([
      expect.closeTo(20.8, 4),
      expect.closeTo(21.2, 4),
      510,
    ]);
  });

  it("equalizes a flat histogram to a straight line that ends at 255", () => {
    const table = equalizeTable(new Float64Array(256).fill(3));
    table.forEach((v, k) => expect(v).toBeCloseTo((255 * (k + 1)) / 256, 10));
  });
});

describe("fixed point operations", () => {
  it("swaps control points given in the wrong order", () => {
    const a = stretchTransfer(64, 32, 192, 224);
    const b = stretchTransfer(192, 224, 64, 32);
    for (let v = 0; v <= 255; v += 5) expect(b(v)).toBe(a(v));
  });

  it("becomes a threshold when both inputs are equal", () => {
    const t = stretchTransfer(100, 0, 100, 255);
    expect([t(0), t(100), t(101), t(255)]).toEqual([0, 0, 255, 255]);
  });

  it("posterizes to evenly spaced levels that keep black and white", () => {
    const t = posterizeTransfer(3);
    expect([t(0), t(85), t(86), t(170), t(171), t(255)]).toEqual([0, 0, 127.5, 127.5, 255, 255]);
  });
});

describe("CLAHE", () => {
  const plane = createPlane(23, 17);
  plane.data.forEach((_, i) => (plane.data[i] = (i * 53 + Math.floor(i / 23) * 7) % 200));

  it("keeps the pixel count when it clips and spreads a histogram", () => {
    const h = Array.from({ length: 256 }, (_, k) => (k === 10 ? 500 : k % 4));
    const total = h.reduce((s, v) => s + v, 0);
    clipHistogram(h, 20);
    expect(h.reduce((s, v) => s + v, 0)).toBe(total);
    expect(Math.max(...h)).toBeLessThanOrEqual(20 + Math.ceil((500 - 20) / 256) + 1);
  });

  it("is rounded global equalization with one tile and no clip limit", () => {
    const curves = tileCurves(plane, 1, 1, 0);
    const exact = equalizeTable(histogram256(plane));
    for (let k = 0; k < 256; k++) expect(curves.luts[k]).toBe(Math.round(exact[k] ?? 0));
  });

  it("applies at each pixel the curve that curveAt reports there", () => {
    const curves = tileCurves(plane, 4, 3, 2);
    const out = applyCurves(plane, curves);
    for (const [x, y] of [
      [0, 0],
      [5, 9],
      [22, 16],
      [11, 3],
    ] as const) {
      const v = plane.data[y * 23 + x] ?? 0;
      expect(out.data[y * 23 + x]).toBeCloseTo(curveAt(curves, x, y)[v] ?? NaN, 4);
    }
  });
});

describe("white balance", () => {
  it("turns the picked neutral into a gray of the same luminance", () => {
    const out = new Float64Array(3);
    whiteBalanceFilter.pixel(210, 200, 180, { neutral: "#d2c8b4", linearLight: true }, out);
    expect(out[0]).toBeCloseTo(out[1] ?? NaN, 6);
    expect(out[2]).toBeCloseTo(out[1] ?? NaN, 6);
  });

  it("makes the three channel means equal with gray world", () => {
    const planes = [0, 1, 2].map((c) => {
      const p = createPlane(9, 7);
      p.data.forEach((_, i) => (p.data[i] = 40 + ((i * (c + 3) * 17) % 180)));
      return p;
    }) as [Plane, Plane, Plane];
    const out = grayWorldFilter.color(planes, { linearLight: false }, CONTEXT);
    const means = out.map((p) => p.data.reduce((s, v) => s + v, 0) / p.data.length);
    expect(means[0]).toBeCloseTo(means[1] ?? NaN, 3);
    expect(means[2]).toBeCloseTo(means[1] ?? NaN, 3);
  });
});
