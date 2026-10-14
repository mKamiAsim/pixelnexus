import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";

import { colorThresholdFilter, hueInside } from "./color-threshold";
import { cfaChannel, DEMOSAIC_TAPS, demosaicFilter } from "./demosaic";

const CONTEXT = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;

describe("demosaicing", () => {
  it("reads the pattern row by row from the top left", () => {
    expect([0, 1, 2, 3].map((k) => cfaChannel("rggb", k & 1, k >> 1))).toEqual([0, 1, 1, 2]);
    expect([0, 1, 2, 3].map((k) => cfaChannel("gbrg", k & 1, k >> 1))).toEqual([1, 2, 0, 1]);
    // The phase follows the image position, also left of and above the image.
    expect(cfaChannel("rggb", -1, -1)).toBe(cfaChannel("rggb", 1, 1));
  });

  it("uses filters whose weights sum to 8, so flat areas stay flat", () => {
    for (const taps of Object.values(DEMOSAIC_TAPS)) {
      for (const list of Object.values(taps)) {
        let total = 0;
        for (const [, , w] of list) total += w;
        expect(total).toBe(8);
      }
    }
    const flat = (v: number) => {
      const p = createPlane(9, 7);
      p.data.fill(v);
      return p;
    };
    const out = demosaicFilter.color([flat(200), flat(90), flat(30)], {}, CONTEXT);
    out.forEach((p, c) => p.data.forEach((v) => expect(v).toBeCloseTo([200, 90, 30][c] ?? 0, 9)));
  });

  it("keeps only the channel of the pattern in the mosaic view", () => {
    const planes = [0, 1, 2].map(() => createPlane(4, 4)) as [Plane, Plane, Plane];
    planes.forEach((p, c) => p.data.fill(10 * (c + 1)));
    const out = demosaicFilter.color(planes, { output: "mosaic", pattern: "bggr" }, CONTEXT);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const own = cfaChannel("bggr", x, y);
        out.forEach((p, c) => expect(p.data[y * 4 + x]).toBe(c === own ? 10 * (c + 1) : 0));
      }
    }
  });
});

describe("color threshold", () => {
  it("wraps the hue range through 0 when the smallest hue is above the largest", () => {
    expect([350, 0, 20, 30, 31, 329].map((h) => hueInside(h, 330, 30))).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect([90, 200, 89.9].map((h) => hueInside(h, 90, 200))).toEqual([true, true, false]);
  });

  it("makes pure red white and pure green black with the default ranges", () => {
    const out = new Float64Array(3);
    colorThresholdFilter.pixel(220, 20, 30, {}, out);
    expect(Array.from(out)).toEqual([255, 255, 255]);
    colorThresholdFilter.pixel(20, 220, 30, {}, out);
    expect(Array.from(out)).toEqual([0, 0, 0]);
    colorThresholdFilter.pixel(20, 220, 30, { invert: true }, out);
    expect(Array.from(out)).toEqual([255, 255, 255]);
  });
});
