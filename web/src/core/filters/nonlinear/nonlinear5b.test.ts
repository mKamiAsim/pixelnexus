import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";

import { alphaTrimmedMeanFilter, contraharmonicPlane, geometricMeanFilter, trimOf } from "./means";
import { histogramMode } from "./mode";
import { chosenRank } from "./rank-order";
import { DEFAULT_WEIGHTS, medianWeights, weightedMedianPlane } from "./weighted-median";
import { extremePlane, rankPlane, windowSum } from "./window";

const plane = (width: number, values: number[]): Plane => {
  const p = createPlane(width, values.length / width);
  p.data.set(values);
  return p;
};
const context = { border: "reflect101" as const, originX: 0, originY: 0, channel: 0 };

describe("window helpers", () => {
  it("sums windows and counts the constant border as the outside value", () => {
    const sums = windowSum(Float64Array.from([1, 2, 3, 4]), 2, 2, 1, "constant", 5);
    // Each 3x3 window holds the 4 values and 5 outside positions.
    expect(Array.from(sums)).toEqual([35, 35, 35, 35]);
  });

  it("gives rank 1 as the min and the last rank as the max", () => {
    const p = plane(5, [9, 3, 7, 1, 8, 2, 6, 4, 5, 0]);
    const low = rankPlane(p, 1, 1, "replicate");
    const high = rankPlane(p, 1, 9, "replicate");
    expect(Array.from(low.data)).toEqual(Array.from(extremePlane(p, 1, "replicate", "min").data));
    expect(Array.from(high.data)).toEqual(Array.from(extremePlane(p, 1, "replicate", "max").data));
  });
});

describe("rank-order parameters", () => {
  it("turns a percentile into a rank like scipy.ndimage.percentile_filter", () => {
    expect(chosenRank({ size: 3, by: "percentile", percentile: 0 }).rank).toBe(1);
    expect(chosenRank({ size: 3, by: "percentile", percentile: 50 }).rank).toBe(5);
    expect(chosenRank({ size: 3, by: "percentile", percentile: 100 }).rank).toBe(9);
    expect(chosenRank({ size: 5, by: "percentile", percentile: 90 }).rank).toBe(23);
  });

  it("keeps a typed rank inside the window", () => {
    expect(chosenRank({ size: 3, by: "rank", rank: 40 }).rank).toBe(9);
    expect(chosenRank({ size: 3, by: "rank", rank: 0 }).rank).toBe(1);
  });
});

describe("mean filters", () => {
  it("drop at most (n - 1) / 2 values at each end", () => {
    expect(trimOf({ size: 3, trim: 20 })).toBe(4);
    const rep = alphaTrimmedMeanFilter.representation({ size: 3, trim: 2 });
    expect(rep).toMatchObject({ kind: "rank", rank: 3, rankTo: 7 });
  });

  it("give 0 for a window with a 0, and the value itself for a flat window", () => {
    const p = plane(3, [50, 50, 50, 50, 0, 50, 50, 50, 50]);
    const geo = geometricMeanFilter.plane(p, { size: 3 }, context);
    expect(geo.data[4]).toBe(0);
    const flat = plane(
      3,
      Array.from({ length: 9 }, () => 80),
    );
    expect(geometricMeanFilter.plane(flat, { size: 3 }, context).data[4]).toBeCloseTo(80, 4);
    expect(contraharmonicPlane(flat, 1, 1.5, "reflect101").data[4]).toBeCloseTo(80, 4);
    expect(contraharmonicPlane(p, 1, -1.5, "reflect101").data[4]).toBe(0);
    // With Q > 0 a 0 adds nothing to either sum.
    expect(contraharmonicPlane(p, 1, 1, "reflect101").data[4]).toBeCloseTo(50, 4);
  });
});

describe("mode and weighted median", () => {
  it("takes the smallest value on a tie", () => {
    const hist = new Int32Array(256);
    hist[40] = 3;
    hist[20] = 3;
    hist[90] = 2;
    expect(histogramMode(hist)).toBe(20);
  });

  it("falls back to the default weights for negative or zero weights", () => {
    expect(medianWeights("1 -1 1").fallback).toBe(true);
    expect(medianWeights("0 0 0").fallback).toBe(true);
    expect(medianWeights("0 1 0; 1 1 1; 0 1 0").fallback).toBe(false);
    expect(medianWeights("1 2").fallback).toBe(true);
    expect(medianWeights(DEFAULT_WEIGHTS).rows[1]).toEqual([1, 3, 1]);
  });

  it("lets a heavy center keep its value", () => {
    const p = plane(3, [10, 10, 10, 10, 200, 10, 10, 10, 10]);
    // The center weight 9 is more than half of the total 17.
    const out = weightedMedianPlane(
      p,
      [
        [1, 1, 1],
        [1, 9, 1],
        [1, 1, 1],
      ],
      "reflect101",
    );
    expect(out.data[4]).toBe(200);
    const plain = weightedMedianPlane(
      p,
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
      "reflect101",
    );
    expect(plain.data[4]).toBe(10);
  });
});
