import { describe, expect, it } from "vitest";

import { createPlane } from "@/core/filters/planes";

import { bayerMatrix, ditherPlane } from "./dither";

describe("dithering", () => {
  it("builds the 4 x 4 Bayer matrix as it is usually printed", () => {
    expect(bayerMatrix(4)).toEqual([
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ]);
    expect(
      bayerMatrix(8)
        .flat()
        .sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 64 }, (_, k) => k));
  });

  it("keeps the mean of a flat gray with Floyd-Steinberg, using only black and white", () => {
    const plane = createPlane(64, 64);
    plane.data.fill(64);
    const out = ditherPlane(plane, "floyd-steinberg", 2);
    expect(new Set(out.data)).toEqual(new Set([0, 255]));
    const mean = out.data.reduce((a, b) => a + b, 0) / out.data.length;
    expect(Math.abs(mean - 64)).toBeLessThan(2);
  });

  it("turns mid gray into an even checkerboard-like mix with the Bayer matrix", () => {
    const plane = createPlane(8, 8);
    plane.data.fill(127.5);
    const out = ditherPlane(plane, "bayer8", 2);
    expect(out.data.filter((v) => v === 255)).toHaveLength(32);
  });
});
