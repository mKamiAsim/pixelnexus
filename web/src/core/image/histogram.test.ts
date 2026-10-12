import { describe, expect, it } from "vitest";

import { computeHistogram, histogramStats } from "./histogram";
import { fromGray } from "./types";

describe("histogram", () => {
  it("counts every pixel once per channel", () => {
    const image = fromGray(3, 2, [0, 0, 10, 10, 10, 255]);
    const histogram = computeHistogram(image);
    expect(histogram.pixels).toBe(6);
    expect(histogram.red[0]).toBe(2);
    expect(histogram.red[10]).toBe(3);
    expect(histogram.luma[255]).toBe(1);
    expect(histogram.alpha[255]).toBe(6);
  });

  it("clips a rectangle to the image", () => {
    const image = fromGray(3, 2, [0, 0, 10, 10, 10, 255]);
    expect(computeHistogram(image, { x: 2, y: 1, width: 10, height: 10 }).pixels).toBe(1);
  });

  it("summarizes a histogram", () => {
    const bins = new Uint32Array(256);
    bins[10] = 2;
    bins[20] = 2;
    const stats = histogramStats(bins);
    expect(stats).toMatchObject({ count: 4, mean: 15, median: 10, min: 10, max: 20 });
    expect(stats.stdDev).toBeCloseTo(5);
  });

  it("returns zeros for an empty histogram", () => {
    expect(histogramStats(new Uint32Array(256))).toEqual({
      count: 0,
      mean: 0,
      stdDev: 0,
      median: 0,
      min: 0,
      max: 0,
    });
  });
});
