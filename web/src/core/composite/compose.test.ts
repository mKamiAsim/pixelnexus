import { describe, expect, it } from "vitest";

import { runFilter } from "@/core/filters/run";
import { BROWSER_FILTERS, browserFilter } from "@/core/filters/registry";
import { createImage, type RgbaImage } from "@/core/image/types";
import { mulberry32 } from "@/core/math/random";

import { composite, type Mask } from "./compose";

function randomImage(width: number, height: number, seed: number): RgbaImage {
  const random = mulberry32(seed);
  const image = createImage(width, height);
  for (let i = 0; i < image.data.length; i++) image.data[i] = Math.floor(random() * 256);
  return image;
}

const full = (image: RgbaImage) => ({ x: 0, y: 0, width: image.width, height: image.height });

describe("compositor", () => {
  const original = randomImage(16, 12, 1);
  const gaussian = browserFilter("gaussian");
  if (!gaussian) throw new Error("missing gaussian");
  const filtered = runFilter(original, gaussian, { sigma: 2 }).image;

  // A mask with a hard square, a feathered ramp and unselected pixels.
  const mask: Mask = { width: 16, height: 12, data: new Uint8Array(16 * 12) };
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 16; x++) mask.data[y * 16 + x] = x < 4 ? 0 : x < 8 ? 255 : (x - 8) * 30;
  }

  it("leaves every pixel with M = 0 bit-identical, for every filter", () => {
    for (const filter of BROWSER_FILTERS) {
      const out = composite(original, runFilter(original, filter, {}).image, full(original), mask);
      for (let i = 0; i < 16 * 12; i++) {
        if (mask.data[i] !== 0) continue;
        expect(Array.from(out.data.subarray(i * 4, i * 4 + 4))).toEqual(
          Array.from(original.data.subarray(i * 4, i * 4 + 4)),
        );
      }
    }
  });

  it("takes the filter result exactly where M = 255", () => {
    const out = composite(original, filtered, full(original), mask);
    for (let i = 0; i < 16 * 12; i++) {
      if (mask.data[i] !== 255) continue;
      expect(Array.from(out.data.subarray(i * 4, i * 4 + 4))).toEqual(
        Array.from(filtered.data.subarray(i * 4, i * 4 + 4)),
      );
    }
  });

  it("blends feathered pixels within 1/255 of the formula", () => {
    const out = composite(original, filtered, full(original), mask);
    for (let i = 0; i < 16 * 12 * 4; i++) {
      const m = (mask.data[i >> 2] ?? 0) / 255;
      const expected = m * (filtered.data[i] ?? 0) + (1 - m) * (original.data[i] ?? 0);
      expect(Math.abs((out.data[i] ?? 0) - expected)).toBeLessThanOrEqual(0.5);
    }
  });

  it("puts a region result in place and leaves the rest untouched", () => {
    const region = { x: 3, y: 2, width: 6, height: 5 };
    const part = runFilter(original, gaussian, { sigma: 2 }, region).image;
    const out = composite(original, part, region);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 16; x++) {
        const o = (y * 16 + x) * 4;
        const inside = x >= 3 && x < 9 && y >= 2 && y < 7;
        const expected = inside ? filtered.data[o] : original.data[o];
        expect(out.data[o]).toBe(expected);
      }
    }
  });

  it("does not change its inputs", () => {
    const before = original.data.slice();
    composite(original, filtered, full(original), mask);
    expect(original.data).toEqual(before);
  });
});
