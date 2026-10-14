import { describe, expect, it } from "vitest";

import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import type { Params, PlaneFilter } from "@/core/filters/types";

import {
  gaussianPyramid,
  gaussianPyramidFilter,
  laplacianPyramidFilter,
  laplacianRebuild,
} from "./pyramid";
import { scaleSpaceFilter, scaleStack } from "./scale-space";

const BORDERS: readonly BorderMode[] = ["reflect101", "reflect", "replicate", "wrap", "constant"];

function texture(width: number, height: number) {
  const plane = createPlane(width, height);
  plane.data.forEach((_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    plane.data[i] = 128 + 60 * Math.sin(0.9 * x + 0.4 * y) + ((x * 7 + y * 13) % 11);
  });
  return plane;
}

const run = (
  filter: PlaneFilter,
  plane: Plane,
  params: Params,
  border: BorderMode = "reflect101",
) => filter.plane(plane, params, { border, originX: 0, originY: 0, channel: 0 });

describe("pyramids", () => {
  it("halves each level, rounding up, and stops at one pixel", () => {
    const sizes = gaussianPyramid(createPlane(13, 7), 3, "reflect101").map((p) => [
      p.width,
      p.height,
    ]);
    expect(sizes).toEqual([
      [13, 7],
      [7, 4],
      [4, 2],
      [2, 1],
    ]);
    expect(gaussianPyramid(createPlane(3, 3), 8, "reflect101")).toHaveLength(3);
  });

  it("gives the image back from a Laplacian pyramid with all gains 1, for every border", () => {
    const plane = texture(23, 17);
    for (const border of BORDERS) {
      const out = laplacianRebuild(gaussianPyramid(plane, 4, border), [1, 1, 1, 1], border);
      expect(out.width).toBe(23);
      expect(out.height).toBe(17);
      out.data.forEach((v, i) => expect(v).toBeCloseTo(plane.data[i] ?? 0, 3));
    }
  });

  it("keeps a flat image flat, except with the constant border", () => {
    const flat = createPlane(10, 13);
    flat.data.fill(77);
    for (const border of BORDERS.filter((b) => b !== "constant")) {
      const out = run(gaussianPyramidFilter, flat, { levels: 3 }, border);
      out.data.forEach((v) => expect(v).toBeCloseTo(77, 4));
      const detail = run(laplacianPyramidFilter, flat, { levels: 3, gain1: 3, gain2: 0 }, border);
      detail.data.forEach((v) => expect(v).toBeCloseTo(77, 4));
    }
  });

  it("is not shift invariant: an impulse on an odd pixel spreads differently", () => {
    const line = (at: number) => {
      const plane = createPlane(21, 1);
      plane.data[at] = 1;
      return Array.from(run(gaussianPyramidFilter, plane, { levels: 1 }).data);
    };
    const even = line(10);
    const odd = line(11);
    // A shift-invariant filter would give the same response, moved by one pixel.
    const moved = odd.slice(1);
    expect(moved.some((v, i) => Math.abs(v - (even[i] ?? 0)) > 1e-6)).toBe(true);
    // Away from the border, REDUCE keeps 8 / 16 of the impulse and EXPAND spreads each coarse
    // pixel with total weight 2, so the response sums to the impulse.
    expect(even.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
  });
});

describe("scale space", () => {
  const spot = (size: number, value: (r2: number) => number) => {
    const plane = createPlane(size, size);
    const c = (size - 1) / 2;
    plane.data.forEach((_, i) => {
      plane.data[i] = value(((i % size) - c) ** 2 + (Math.floor(i / size) - c) ** 2);
    });
    return plane;
  };
  const chosenAtCenter = (plane: Plane, params: Params) => {
    const out = run(scaleSpaceFilter, plane, { measure: "laplacian", output: "scale", ...params });
    return out.data[((plane.height - 1) / 2) * plane.width + (plane.width - 1) / 2] ?? 0;
  };

  it("spaces the stack evenly in log sigma", () => {
    const stack = scaleStack(1, 4, 5);
    [1, Math.SQRT2, 2, 2 * Math.SQRT2, 4].forEach((v, i) => expect(stack[i]).toBeCloseTo(v, 12));
    expect(scaleStack(2, 8, 1)).toEqual([2]);
    expect(scaleStack(3, 2, 4)).toEqual([3]);
  });

  it("picks the sigma of a Gaussian blob with the normalized Laplacian", () => {
    // At the center, t times the Laplacian of a blob of variance s^2 peaks at t = s^2.
    const blob = spot(65, (r2) => 200 * Math.exp(-r2 / (2 * 16)));
    expect(chosenAtCenter(blob, { sigma: 2, sigmaMax: 8, scales: 25 })).toBeCloseTo(4, 0);
  });

  it("picks about r / sqrt 2 at the center of a disk of radius r", () => {
    // At the center of a disk, t times the Laplacian is -(r^2 / t) exp(-r^2 / (2 t)), largest
    // in size at t = r^2 / 2.
    const step = 16 ** (1 / 40);
    for (const r of [4, 8, 12]) {
      const disk = spot(97, (r2) => (r2 <= r * r ? 255 : 0));
      const chosen = chosenAtCenter(disk, { sigma: 1, sigmaMax: 16, scales: 41 });
      expect(Math.abs(Math.log(chosen / (r / Math.SQRT2)))).toBeLessThanOrEqual(Math.log(step));
    }
  });

  it("keeps the sign of the strongest response and reports its sigma", () => {
    const disk = spot(41, (r2) => (r2 <= 25 ? 255 : 0));
    const params = { measure: "laplacian", sigma: 1, sigmaMax: 8, scales: 7 };
    const response = run(scaleSpaceFilter, disk, { ...params, output: "response" });
    // A bright disk on a dark ground has a negative Laplacian at its center.
    expect(response.data[20 * 41 + 20]).toBeLessThan(0);
    const scales = run(scaleSpaceFilter, disk, { ...params, output: "scale" });
    const stack = scaleStack(1, 8, 7);
    scales.data.forEach((v) => expect(stack.some((s) => Math.abs(s - v) < 1e-5)).toBe(true));
  });
});
