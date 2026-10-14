import { describe, expect, it } from "vitest";

import { createPlane } from "@/core/filters/planes";

import { applyTable, equalizeTable, histogram256, histogramPercentile } from "./histogram";
import { posterizeTransfer, stretchTransfer } from "./point-ops";

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
