import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";
import { mulberry32 } from "@/core/math/random";

import {
  boxAround,
  edgeMap,
  gradientAt,
  livePath,
  maxGradient,
  pathLength,
  strongestEdge,
  type Pixel,
} from "./livewire";

/** A gray image with a dark square from (x0, y0) to (x1, y1), ends excluded. */
function square(size: number, x0: number, y0: number, x1: number, y1: number): RgbaImage {
  const image = createImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = x >= x0 && x < x1 && y >= y0 && y < y1 ? 40 : 200;
      image.data.set([v, v, v, 255], (y * size + x) * 4);
    }
  }
  return image;
}

const connected = (path: readonly Pixel[]) =>
  path.every((p, i) => {
    const q = path[i - 1];
    return !q || Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) === 1;
  });

describe("live wire", () => {
  it("finds the largest Sobel gradient, the same as one pixel at a time", () => {
    const random = mulberry32(3);
    const image = createImage(13, 9);
    for (let i = 0; i < image.data.length; i++) image.data[i] = Math.floor(random() * 256);
    let max = 0;
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 13; x++) max = Math.max(max, gradientAt(image, x, y));
    expect(maxGradient(image)).toBeCloseTo(max, 3);
    // A flat image has no gradient anywhere.
    expect(maxGradient(square(8, 0, 0, 0, 0))).toBe(0);
  });

  it("goes straight across a flat image", () => {
    const image = square(20, 0, 0, 0, 0);
    const map = edgeMap(image, boxAround(image, { x: 2, y: 3 }, { x: 15, y: 3 }, 4), 0, 0.1);
    const path = livePath(map, { x: 2, y: 3 }, { x: 15, y: 3 });
    expect(path).toHaveLength(14);
    expect(path.every((p) => p.y === 3)).toBe(true);
  });

  it("follows an edge instead of cutting a corner", () => {
    const image = square(40, 10, 10, 30, 30);
    const gmax = maxGradient(image);
    const from = { x: 10, y: 20 };
    const to = { x: 20, y: 10 };
    const map = edgeMap(image, boxAround(image, from, to, 8), gmax, 0.1);
    const path = livePath(map, from, to);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    expect(connected(path)).toBe(true);
    // Every pixel of the path is on the edge of the square, so it goes around the corner.
    for (const p of path) expect(gradientAt(image, p.x, p.y) / gmax).toBeGreaterThan(0.5);
    expect(pathLength(path)).toBeGreaterThanOrEqual(19);
  });

  it("ignores edges weaker than the contrast setting", () => {
    const image = square(40, 10, 10, 30, 30);
    const gmax = maxGradient(image);
    const box = boxAround(image, { x: 20, y: 5 }, { x: 20, y: 5 }, 10);
    const near = strongestEdge(edgeMap(image, box, gmax, 0.1), { x: 20, y: 6 }, 6);
    // Two rows of pixels next to the edge have the full gradient. The nearer one wins.
    expect(near).toEqual({ x: 20, y: 9 });
    expect(strongestEdge(edgeMap(image, box, gmax, 0.1), { x: 20, y: 2 }, 3)).toBeNull();
    // A stronger edge than any in the image is never found.
    expect(strongestEdge(edgeMap(image, box, gmax, 1.01), { x: 20, y: 6 }, 6)).toBeNull();
  });

  it("keeps boxes inside the image and refuses ends outside the box", () => {
    const image = square(10, 0, 0, 0, 0);
    expect(boxAround(image, { x: 1, y: 8 }, { x: 3, y: 9 }, 5)).toEqual({
      x: 0,
      y: 3,
      width: 9,
      height: 7,
    });
    const map = edgeMap(image, { x: 0, y: 0, width: 4, height: 4 }, 0, 0.1);
    expect(() => livePath(map, { x: 0, y: 0 }, { x: 5, y: 5 })).toThrow(RangeError);
  });
});
