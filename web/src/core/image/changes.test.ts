import { describe, expect, it } from "vitest";

import { describeChanges } from "./changes";
import { createImage } from "./types";

const filled = (width: number, height: number, rgba: [number, number, number, number]) => {
  const image = createImage(width, height);
  for (let i = 0; i < width * height; i++) image.data.set(rgba, i * 4);
  return image;
};

describe("step change warnings", () => {
  const color = filled(2, 2, [200, 100, 50, 255]);

  it("say nothing when only pixel values change", () => {
    expect(describeChanges(color, filled(2, 2, [10, 20, 30, 255]))).toEqual([]);
    expect(describeChanges(color, color)).toEqual([]);
  });

  it("name a size change", () => {
    expect(describeChanges(color, filled(4, 2, [200, 100, 50, 255]))).toEqual([
      "The size changed from 2 x 2 to 4 x 2 pixels.",
    ]);
  });

  it("notice transparency coming and going", () => {
    const see = filled(2, 2, [200, 100, 50, 128]);
    expect(describeChanges(color, see)[0]).toMatch(/now transparent/);
    expect(describeChanges(see, color)).toEqual(["The image has no transparency any more."]);
  });

  it("notice when color is lost, not when a gray image stays gray", () => {
    const gray = filled(2, 2, [90, 90, 90, 255]);
    expect(describeChanges(color, gray)[0]).toMatch(/no color any more/);
    expect(describeChanges(gray, filled(2, 2, [40, 40, 40, 255]))).toEqual([]);
  });
});
