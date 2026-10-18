import { describe, expect, it } from "vitest";

import { clampCrop, crop, flip, rotate } from "@/core/image/transform";
import { createImage, getChannel, type RgbaImage } from "@/core/image/types";

/** A 3x2 image whose red channel holds the pixel index, so moves are easy to read. */
function indexed(): RgbaImage {
  const image = createImage(3, 2);
  for (let i = 0; i < 6; i++) image.data.set([i, 10 + i, 20 + i, 255 - i], i * 4);
  return image;
}

const reds = (image: RgbaImage) =>
  Array.from({ length: image.height }, (_, y) =>
    Array.from({ length: image.width }, (_, x) => getChannel(image, x, y, 0)),
  );

describe("rotate and flip", () => {
  it("rotates clockwise", () => {
    expect(reds(rotate(indexed(), "cw"))).toEqual([
      [3, 0],
      [4, 1],
      [5, 2],
    ]);
  });

  it("rotates counterclockwise", () => {
    expect(reds(rotate(indexed(), "ccw"))).toEqual([
      [2, 5],
      [1, 4],
      [0, 3],
    ]);
  });

  it("rotates by half a turn", () => {
    expect(reds(rotate(indexed(), "half"))).toEqual([
      [5, 4, 3],
      [2, 1, 0],
    ]);
  });

  it("flips both ways", () => {
    expect(reds(flip(indexed(), "horizontal"))).toEqual([
      [2, 1, 0],
      [5, 4, 3],
    ]);
    expect(reds(flip(indexed(), "vertical"))).toEqual([
      [3, 4, 5],
      [0, 1, 2],
    ]);
  });

  it("moves all four channels together and changes no values", () => {
    const out = rotate(indexed(), "cw");
    expect([0, 1, 2, 3].map((c) => getChannel(out, 1, 0, c))).toEqual([0, 10, 20, 255]);
    expect([...out.data].sort()).toEqual([...indexed().data].sort());
  });

  it("four quarter turns give the original", () => {
    let image = indexed();
    for (let i = 0; i < 4; i++) image = rotate(image, "cw");
    expect(image.data).toEqual(indexed().data);
  });
});

describe("crop", () => {
  it("keeps the rectangle, every channel unchanged", () => {
    const out = crop(indexed(), { x: 1, y: 0, width: 2, height: 2 });
    expect(reds(out)).toEqual([
      [1, 2],
      [4, 5],
    ]);
    expect(Array.from(out.data.subarray(0, 4))).toEqual([1, 11, 21, 254]);
  });

  it("cuts a rectangle to the image, and refuses one outside it", () => {
    expect(clampCrop({ x: -2, y: 1, width: 4, height: 9 }, 3, 2)).toEqual({
      x: 0,
      y: 1,
      width: 2,
      height: 1,
    });
    expect(clampCrop({ x: 3, y: 0, width: 2, height: 2 }, 3, 2)).toBeNull();
  });
});
