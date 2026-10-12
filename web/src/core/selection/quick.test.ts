import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";
import { createMask, resizeMask } from "@/core/mask/mask";
import { mulberry32 } from "@/core/math/random";

import { growSuperpixels, superpixelMask, touchedSuperpixels } from "./quick";
import { connectLabels, slicLabels, stepFor, superpixels } from "./slic";

/** Red on the left, blue on the right, each with a little noise. */
function twoHalves(width: number, height: number): RgbaImage {
  const random = mulberry32(5);
  const image = createImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = Math.round((random() - 0.5) * 12);
      const color = x < width / 2 ? [200 + n, 40 + n, 40 + n] : [30 + n, 60 + n, 200 + n];
      image.data.set([...color, 255], (y * width + x) * 4);
    }
  }
  return image;
}

/** True when every label is one 4-connected piece. */
function connected(labels: Int32Array, w: number, h: number): boolean {
  const pieces = connectLabels(labels, w, h, 1);
  let a = 0;
  let b = 0;
  for (const l of labels) a = Math.max(a, l + 1);
  for (const l of pieces) b = Math.max(b, l + 1);
  return a === b;
}

describe("SLIC superpixels", () => {
  const image = twoHalves(64, 48);
  const sp = superpixels(image, 8);

  it("gives connected superpixels of about the grid size that keep to the color edge", () => {
    const labels = slicLabels(image, 8);
    expect(connected(labels, 64, 48)).toBe(true);
    expect(sp.count).toBeGreaterThan(30);
    expect(sp.count).toBeLessThan(70);
    // No superpixel has pixels on both sides of the edge between the halves.
    const side = new Map<number, boolean>();
    for (let p = 0; p < labels.length; p++) {
      const left = p % 64 < 32;
      const label = sp.labels[p] ?? 0;
      expect(side.get(label) ?? left).toBe(left);
      side.set(label, left);
    }
  });

  it("joins small pieces to a neighbor and numbers labels from 0", () => {
    // A single stray pixel of label 1 inside label 0 joins label 0.
    const labels = Int32Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(Array.from(connectLabels(labels, 3, 3, 2))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Two separate pieces of one label get two labels.
    const split = Int32Array.from([0, 1, 0]);
    expect(Array.from(connectLabels(split, 3, 1, 1))).toEqual([0, 1, 2]);
  });

  it("records colors, symmetric neighbors and strong edges only between the halves", () => {
    let sizes = 0;
    for (const s of sp.size) sizes += s;
    expect(sizes).toBe(64 * 48);
    for (let i = 0; i < sp.count; i++) {
      for (let at = sp.start[i] ?? 0; at < (sp.start[i + 1] ?? 0); at++) {
        const j = sp.adjacent[at] ?? 0;
        const back = Array.from(sp.adjacent.subarray(sp.start[j], sp.start[j + 1]));
        expect(back).toContain(i);
        const left = (sp.color[i * 3 + 2] ?? 0) < (sp.color[j * 3 + 2] ?? 0) - 100;
        const right = (sp.color[j * 3 + 2] ?? 0) < (sp.color[i * 3 + 2] ?? 0) - 100;
        const strength = sp.edge[at] ?? 0;
        if (left || right) expect(strength).toBeGreaterThan(0.2);
        else expect(strength).toBeLessThan(0.1);
      }
    }
  });

  it("picks a step for about 3000 superpixels, within limits", () => {
    expect(stepFor(512, 512)).toBe(9);
    expect(stepFor(64, 64)).toBe(6);
    expect(stepFor(6000, 6000)).toBe(32);
  });
});

describe("Quick Selection growth", () => {
  const image = twoHalves(64, 48);
  const sp = superpixels(image, 8);
  const leftSeed = sp.labels[20 * 64 + 5] ?? 0;

  it("grows over similar superpixels and stops at the edge", () => {
    const selected = growSuperpixels(sp, [leftSeed], { tolerance: 40, edgeSensitivity: 0.5 });
    const mask = superpixelMask(sp, selected);
    for (let p = 0; p < mask.data.length; p++) {
      expect(mask.data[p], `pixel ${p}`).toBe(p % 64 < 32 ? 255 : 0);
    }
  });

  it("selects only the seeds with tolerance 0, and everything with a huge one", () => {
    const only = growSuperpixels(sp, [leftSeed], { tolerance: 0, edgeSensitivity: 1 });
    expect(only.reduce((a, b) => a + b, 0)).toBe(1);
    const all = growSuperpixels(sp, [leftSeed], { tolerance: 1000, edgeSensitivity: 0 });
    expect(all.reduce((a, b) => a + b, 0)).toBe(sp.count);
  });

  it("finds the superpixels under a brush stroke", () => {
    const stroke = createMask(64, 48);
    stroke.data[20 * 64 + 5] = 255;
    stroke.data[20 * 64 + 60] = 100;
    expect([...touchedSuperpixels(sp, stroke)]).toEqual([leftSeed]);
  });
});

describe("mask resize", () => {
  it("returns the same mask at the same size and interpolates between pixel centers", () => {
    const mask = createMask(2, 1);
    mask.data.set([0, 255]);
    expect(resizeMask(mask, 2, 1)).toBe(mask);
    const wide = resizeMask(mask, 4, 2);
    // Centers at source x = -0.25, 0.25, 0.75, 1.25: clamped, 1/4, 3/4, clamped.
    expect(Array.from(wide.data.subarray(0, 4))).toEqual([0, 64, 191, 255]);
    expect(Array.from(wide.data.subarray(4, 8))).toEqual([0, 64, 191, 255]);
    const small = resizeMask(createMask(8, 8, 255), 3, 3);
    expect(small.data.every((v) => v === 255)).toBe(true);
  });
});
