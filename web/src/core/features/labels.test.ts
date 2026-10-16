import { describe, expect, it } from "vitest";

import { labelColor } from "@/core/filters/segmentation/regions";

import {
  decodeLabels,
  isLabelResult,
  labelMask,
  paintLabels,
  type LabelMap,
  type LabelResult,
} from "./labels";

const table = {
  kind: "features" as const,
  columns: [{ key: "label", label: "Label", unit: "" }],
  rows: [[1], [2]],
  summary: "2 regions",
};

function encode(values: number[], bits: 8 | 16 | 32): string {
  const bytes = new Uint8Array(values.length * (bits / 8));
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => {
    if (bits === 8) view.setUint8(i, v);
    else if (bits === 16) view.setUint16(2 * i, v, true);
    else view.setUint32(4 * i, v, true);
  });
  return btoa(String.fromCharCode(...bytes));
}

const result = (values: number[], bits: 8 | 16 | 32): LabelResult => ({
  kind: "labels",
  width: 3,
  height: 2,
  bits,
  data: encode(values, bits),
  table,
});

describe("label maps", () => {
  it("recognizes a label result in JSON", () => {
    expect(isLabelResult(result([0, 1, 1, 2, 2, 2], 8))).toBe(true);
    expect(isLabelResult({ ...result([0, 1, 1, 2, 2, 2], 8), bits: 12 })).toBe(false);
    expect(isLabelResult(table)).toBe(false);
  });

  it.each([8, 16, 32] as const)("decodes %i-bit little-endian labels", (bits) => {
    const values = bits === 8 ? [0, 1, 255, 2, 3, 4] : [0, 1, 300, 2, 65535, 4];
    const big = bits === 32 ? [0, 1, 70000, 2, 4000000, 4] : values;
    expect([...decodeLabels(result(big, bits)).data]).toEqual(big);
  });

  it("refuses data that does not fit the size", () => {
    expect(() => decodeLabels({ ...result([0, 1, 1, 2, 2, 2], 8), width: 4 })).toThrow(RangeError);
  });

  it("paints regions in their label colors, with label 0 clear and boundaries opaque", () => {
    const map: LabelMap = { width: 3, height: 2, data: Uint32Array.from([0, 1, 1, 2, 2, 1]) };
    const painted = paintLabels(map, 100);
    const pixel = (i: number) => [...painted.data.slice(4 * i, 4 * i + 4)];
    expect(pixel(0)).toEqual([0, 0, 0, 0]);
    const [r, g, b] = labelColor(1).map((v) => Math.round(v));
    // Pixel 2 (label 1) has label 1 below it and nothing to its right: inside, see through.
    expect(pixel(2)).toEqual([r, g, b, 100]);
    // Pixel 1 (label 1) has label 2 below it: a boundary.
    expect(pixel(1)?.[3]).toBe(255);
    expect(paintLabels(map).data[4 * 2 + 3]).toBe(255);
  });

  it("selects one region or all of them", () => {
    const map: LabelMap = { width: 3, height: 2, data: Uint32Array.from([0, 1, 1, 2, 2, 1]) };
    expect([...labelMask(map, new Set([1])).data]).toEqual([0, 255, 255, 0, 0, 255]);
    expect([...labelMask(map, "all").data]).toEqual([0, 255, 255, 255, 255, 255]);
  });
});
