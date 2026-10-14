import { describe, expect, it } from "vitest";

import { localMoments } from "@/core/filters/adaptive/local-stats";
import { createPlane, type Plane } from "@/core/filters/planes";

import {
  cclLabelFilter,
  componentLabels,
  growRegion,
  growSettings,
  kmeansColors,
  labelColor,
  seedPixel,
} from "./regions";
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

/** Three planes of a gray image drawn from rows of text, "#" bright and "." dark. */
function grayPlanes(rows: string[], bright = 200, dark = 20): [Plane, Plane, Plane] {
  const p = createPlane(rows[0]?.length ?? 0, rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => (p.data[y * p.width + x] = ch === "#" ? bright : dark)),
  );
  return [p, p, p];
}

describe("connected-component labeling", () => {
  const planes = grayPlanes(["##...", "##...", "..#..", "...#.", "....#"]);

  it("joins diagonal neighbors with 8 neighbors and not with 4", () => {
    expect(componentLabels(planes, { connectivity: "8" }).count).toBe(1);
    expect(componentLabels(planes, { connectivity: "4" }).count).toBe(4);
  });

  it("numbers components by their first pixel in a row by row scan", () => {
    const { labels } = componentLabels(planes, { connectivity: "4" });
    expect([labels[0], labels[12], labels[18], labels[24]]).toEqual([1, 2, 3, 4]);
  });

  it("paints each component in its own color and the background black", () => {
    const out = cclLabelFilter.color(planes, { connectivity: "4" }, CONTEXT);
    out.forEach((p, c) => expect(p.data[12]).toBeCloseTo(labelColor(2)[c] ?? NaN, 4));
    expect(out.map((p) => p.data[2])).toEqual([0, 0, 0]);
  });
});

describe("region growing", () => {
  it("places the seed at a percent of the width and height", () => {
    expect(seedPixel(10, 20, growSettings({ seedX: 50, seedY: 0 }))).toEqual([5, 0]);
    expect(seedPixel(10, 20, growSettings({ seedX: 100, seedY: 99.9 }))).toEqual([9, 19]);
  });

  it("keeps only the matching pixels that connect to the seed", () => {
    // Two bright areas; the seed is in the left one.
    const planes = grayPlanes(["##..#", "##..#", "##..#"]);
    const region = growRegion(planes, growSettings({ seedX: 10, seedY: 50, tolerance: 10 }));
    expect(Array.from(region)).toEqual([1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0]);
  });
});

describe("k-means color segmentation", () => {
  it("finds the means of two groups of colors", () => {
    const planes = grayPlanes(["##..", "##..", "#..."], 200, 20);
    planes[0] = { ...planes[0], data: planes[0].data.map((v, i) => v + (i % 3)) };
    const { centers, labels } = kmeansColors(planes, 2, 20);
    const means = [0, 1].map((c) => {
      const members = Array.from(planes[0].data).filter((_, i) => labels[i] === c);
      return members.reduce((a, b) => a + b, 0) / members.length;
    });
    expect([centers[0], centers[3]]).toEqual(means);
  });

  it("uses fewer clusters when the image has fewer colors than k", () => {
    const planes = grayPlanes(["#.", ".#"]);
    expect(kmeansColors(planes, 5, 10).centers).toHaveLength(6);
  });
});
