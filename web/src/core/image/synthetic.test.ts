import { describe, expect, it } from "vitest";

import { computeHistogram } from "@/core/image/histogram";
import { SYNTHETIC_IMAGES, noisePatches, stepEdge, zonePlate } from "@/core/image/synthetic";
import { createImage, fromGray, getChannel } from "@/core/image/types";

describe("synthetic images", () => {
  it.each(SYNTHETIC_IMAGES.map((s) => [s.id, s] as const))(
    "%s has the requested size",
    (_id, spec) => {
      const image = spec.make(64, 48);
      expect(image.width).toBe(64);
      expect(image.height).toBe(48);
      expect(image.data).toHaveLength(64 * 48 * 4);
    },
  );

  it("step edge has two levels split at the middle", () => {
    const image = stepEdge(10, 2);
    expect(getChannel(image, 4, 0, 0)).toBe(40);
    expect(getChannel(image, 5, 0, 0)).toBe(215);
  });

  it("zone plate is bright at the center", () => {
    const image = zonePlate(65, 65);
    expect(getChannel(image, 32, 32, 0)).toBe(255);
  });

  it("noise patches are the same for every call", () => {
    expect(noisePatches(32, 32).data).toEqual(noisePatches(32, 32).data);
  });

  it("ids are unique", () => {
    const ids = SYNTHETIC_IMAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("image helpers and histogram", () => {
  it("rejects invalid sizes", () => {
    expect(() => createImage(0, 3)).toThrow(RangeError);
    expect(() => fromGray(2, 2, [1, 2, 3])).toThrow(RangeError);
  });

  it("counts every pixel once per channel", () => {
    const image = fromGray(3, 2, [0, 0, 10, 10, 10, 255]);
    const histogram = computeHistogram(image);
    expect(histogram.pixels).toBe(6);
    expect(histogram.red[10]).toBe(3);
    expect(histogram.luma[255]).toBe(1);
    expect(histogram.alpha[255]).toBe(6);
  });

  it("clips the rectangle to the image", () => {
    const image = fromGray(3, 2, [0, 0, 10, 10, 10, 255]);
    expect(computeHistogram(image, { x: 2, y: 1, width: 10, height: 10 }).pixels).toBe(1);
  });
});
