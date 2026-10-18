import { describe, expect, it } from "vitest";

import { runFilter } from "@/core/filters/run";
import { BROWSER_FILTERS, browserFilter } from "@/core/filters/registry";
import { createImage, type RgbaImage } from "@/core/image/types";
import { mulberry32 } from "@/core/math/random";

import { composite, type Mask } from "./compose";
import { processingRegion, scopeMask } from "./scope";

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

describe("filter scope and region processing", () => {
  const image = randomImage(24, 20, 7);
  // A soft blob away from the edges: hard inside, a ramp around it, 0 elsewhere.
  const blob: Mask = { width: 24, height: 20, data: new Uint8Array(24 * 20) };
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11, y - 9);
      blob.data[y * 24 + x] = d <= 4 ? 255 : d <= 7 ? Math.round(((7 - d) / 3) * 255) : 0;
    }
  }

  it("gives the mask for each scope", () => {
    expect(scopeMask(blob, "whole")).toBeNull();
    expect(scopeMask(null, "selection")).toBeNull();
    expect(scopeMask(blob, "selection")).toBe(blob);
    const outside = scopeMask(blob, "inverse");
    expect(outside?.data[0]).toBe(255);
    expect(outside?.data[9 * 24 + 11]).toBe(0);
    // The inverted mask is made once per selection.
    expect(scopeMask(blob, "inverse")).toBe(outside);
  });

  it("processes the mask bounds, the whole image for global filters, and nothing for an empty mask", () => {
    expect(processingRegion(image, null, false)).toEqual(full(image));
    expect(processingRegion(image, blob, false)).toEqual({ x: 5, y: 3, width: 13, height: 13 });
    expect(processingRegion(image, blob, true)).toEqual(full(image));
    const empty: Mask = { width: 24, height: 20, data: new Uint8Array(24 * 20) };
    expect(processingRegion(image, empty, false)).toBeNull();
  });

  it("matches a whole-image run inside the selection and keeps M = 0 pixels, for every filter", () => {
    for (const filter of BROWSER_FILTERS) {
      for (const scope of ["selection", "inverse"] as const) {
        const mask = scopeMask(blob, scope);
        const region = processingRegion(image, mask, false);
        if (!mask || !region) throw new Error("expected a mask and a region");
        const whole = runFilter(image, filter, {}).image;
        const out = composite(image, runFilter(image, filter, {}, region).image, region, mask);
        for (let i = 0; i < 24 * 20; i++) {
          const m = mask.data[i];
          if (m !== 0 && m !== 255) continue;
          const expected = m === 0 ? image : whole;
          expect(
            Array.from(out.data.subarray(i * 4, i * 4 + 4)),
            `${filter.id}, ${scope}, pixel ${i}`,
          ).toEqual(Array.from(expected.data.subarray(i * 4, i * 4 + 4)));
        }
      }
    }
    // Every registered filter runs four times here. Under coverage on CI it takes over 30 s.
  }, 120_000);
});
