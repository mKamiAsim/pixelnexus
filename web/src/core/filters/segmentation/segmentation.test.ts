import { describe, expect, it } from "vitest";

import { localMoments } from "@/core/filters/adaptive/local-stats";
import { createPlane, type Plane } from "@/core/filters/planes";

import { bradleyFilter, otsuThreshold, wolfFilter, wolfThresholds } from "./thresholds";

const CONTEXT = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;

/** A plane of fractional values from a fixed pattern, so no pixel lies on its local mean. */
function patternPlane(width: number, height: number): Plane {
  const plane = createPlane(width, height);
  for (let i = 0; i < plane.data.length; i++) {
    plane.data[i] = ((i * 7919 + 13) % 251) + 0.37 * ((i * 31) % 7);
  }
  return plane;
}

describe("Otsu threshold", () => {
  it("splits two well separated groups between them", () => {
    const h = new Float64Array(256);
    h[40] = 100;
    h[50] = 50;
    h[200] = 80;
    h[210] = 40;
    const t = otsuThreshold(h);
    expect(t).toBeGreaterThanOrEqual(50);
    expect(t).toBeLessThan(200);
    // Every threshold from 50 to 199 splits the same way, so the first one wins.
    expect(t).toBe(50);
  });

  it("gives a flat image its own level, so nothing is above it", () => {
    const h = new Float64Array(256);
    h[77] = 10;
    expect(otsuThreshold(h)).toBe(77);
  });
});

describe("Wolf and Bradley thresholds", () => {
  const plane = patternPlane(29, 17);
  const size = 7;
  const { mean } = localMoments(plane, (size - 1) >> 1, CONTEXT.border);
  const aboveMean = Array.from(plane.data, (v, i) => (v > (mean[i] ?? 0) ? 255 : 0));

  it("both threshold at the local mean when k = 0 and t = 0", () => {
    expect(
      Math.min(...Array.from(plane.data, (v, i) => Math.abs(v - (mean[i] ?? 0)))),
    ).toBeGreaterThan(1e-3);
    const wolf = wolfFilter.plane(plane, { size, k: 0 }, CONTEXT);
    const bradley = bradleyFilter.plane(plane, { size, percent: 0 }, CONTEXT);
    expect(Array.from(wolf.data)).toEqual(aboveMean);
    expect(Array.from(bradley.data)).toEqual(aboveMean);
  });

  it("Wolf with k = 1 thresholds at M + (s / R) (m - M)", () => {
    const t = wolfThresholds(plane, size, 1, CONTEXT.border);
    const { variance } = localMoments(plane, (size - 1) >> 1, CONTEXT.border);
    const s = variance.map(Math.sqrt);
    const low = Math.min(...plane.data);
    const range = Math.max(...s);
    t.forEach((value, i) => {
      const m = mean[i] ?? 0;
      expect(value).toBeCloseTo(low + ((s[i] ?? 0) / range) * (m - low), 9);
    });
  });

  it("Wolf gives a flat image all 0, since its threshold is the value itself", () => {
    const flat = createPlane(9, 6);
    flat.data.fill(140);
    expect(Array.from(wolfThresholds(flat, 5, 0.5, "replicate"))).toEqual(Array(54).fill(140));
    expect(Math.max(...wolfFilter.plane(flat, { size: 5 }, CONTEXT).data)).toBe(0);
  });

  it("Bradley does not change when the whole image is made darker by a factor", () => {
    const half = { ...plane, data: plane.data.map((v) => v / 2) };
    const params = { size: 9, percent: 15 };
    expect(Array.from(bradleyFilter.plane(half, params, CONTEXT).data)).toEqual(
      Array.from(bradleyFilter.plane(plane, params, CONTEXT).data),
    );
  });

  it("Bradley makes a pixel black when it is t percent or more below its window mean", () => {
    // One dark pixel in a flat 5 x 5 page: its window mean is (24 * 200 + v) / 25.
    const page = createPlane(5, 5);
    page.data.fill(200);
    const params = { size: 5, percent: 15 };
    page.data[12] = 165; // mean 198.6, threshold 168.81: black
    expect(bradleyFilter.plane(page, params, CONTEXT).data[12]).toBe(0);
    page.data[12] = 172; // mean 198.88, threshold 169.048: white
    expect(bradleyFilter.plane(page, params, CONTEXT).data[12]).toBe(255);
  });
});
