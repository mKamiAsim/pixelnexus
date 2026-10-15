import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";

import { bayerMatrix, ditherPlane } from "./dither";
import { bloomFilter, tiltShiftPlane, tiltSigma } from "./lens";
import { circleInSquare, colorDodge, dotRadius, halftonePlane, oilPaint } from "./painterly";

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

describe("painterly and lens effects", () => {
  const ctx = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;

  it("draws halftone dots whose area inside the cell equals the ink", () => {
    for (const ink of [0.05, 0.3, 0.6, 0.785, 0.9, 0.99]) {
      expect(circleInSquare(dotRadius(ink))).toBeCloseTo(ink, 9);
    }
  });

  it("keeps the mean tone of a flat gray in the halftone", () => {
    for (const gray of [64, 128, 200]) {
      const flat = createPlane(96, 96, gray);
      const out = halftonePlane(flat, 8, 0, "reflect101");
      const mean = out.data.reduce((s, v) => s + v, 0) / out.data.length;
      expect(Math.abs(mean - gray)).toBeLessThan(4);
    }
  });

  it("follows the color dodge of the W3C spec at its edges", () => {
    expect(colorDodge(0, 0.9)).toBe(0);
    expect(colorDodge(0.3, 1)).toBe(1);
    expect(colorDodge(0.3, 0.5)).toBeCloseTo(0.6, 12);
    expect(colorDodge(0.8, 0.5)).toBe(1);
  });

  it("leaves the rows inside the tilt-shift band sharp", () => {
    const p = createPlane(20, 40);
    p.data.forEach((_, i) => (p.data[i] = (i * 37) % 251));
    const params = { center: 50, band: 20, ramp: 20, maxBlur: 4 };
    const out = tiltShiftPlane(p, params, "reflect101");
    for (let y = 13; y < 27; y++) {
      expect(tiltSigma((y + 0.5) / 40, params)).toBe(0);
      for (let x = 0; x < 20; x++) expect(out.data[y * 20 + x]).toBe(p.data[y * 20 + x]);
    }
  });

  it("changes nothing with bloom strength 0, and keeps a flat image flat in oil painting", () => {
    const planes = [0, 1, 2].map((c) => {
      const p = createPlane(12, 9);
      p.data.forEach((_, i) => (p.data[i] = 30 + ((i * (c + 5) * 13) % 200)));
      return p;
    }) as [Plane, Plane, Plane];
    const out = bloomFilter.color(planes, { strength: 0 }, ctx);
    out.forEach((p, c) =>
      p.data.forEach((v, i) => expect(v).toBeCloseTo(planes[c]?.data[i] ?? 0, 3)),
    );
    const flat = [0, 1, 2].map(() => createPlane(10, 10, 90)) as [Plane, Plane, Plane];
    oilPaint(flat, 2, 16, "reflect101").forEach((p) => p.data.forEach((v) => expect(v).toBe(90)));
  });
});
