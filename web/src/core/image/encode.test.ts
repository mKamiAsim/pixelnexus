import { describe, expect, it } from "vitest";

import { flatten, hasTransparency } from "./encode";
import { createImage, fromGray } from "./types";

describe("export helpers", () => {
  it("blends transparent pixels over the background", () => {
    const image = createImage(2, 1);
    image.data.set([200, 100, 0, 255, 100, 50, 0, 128]);
    const a = 128 / 255;
    const out = flatten(image, [255, 255, 255]);
    expect(Array.from(out.data)).toEqual([
      200,
      100,
      0,
      255,
      Math.round(a * 100 + (1 - a) * 255),
      Math.round(a * 50 + (1 - a) * 255),
      Math.round((1 - a) * 255),
      255,
    ]);
  });

  it("finds transparency", () => {
    expect(hasTransparency(fromGray(2, 2, [1, 2, 3, 4]))).toBe(false);
    expect(hasTransparency(createImage(1, 1))).toBe(true);
  });
});
