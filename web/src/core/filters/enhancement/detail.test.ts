import { describe, expect, it } from "vitest";

import { createPlane } from "@/core/filters/planes";

import { detailBase, detailEnhanceFilter, detailSettings } from "./detail";

const CONTEXT = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;

describe("detail enhancement", () => {
  const plane = createPlane(24, 16);
  plane.data.forEach((_, i) => (plane.data[i] = ((i * 7919) % 211) + (i % 24 < 12 ? 0 : 40)));

  for (const base of ["guided", "bilateral"]) {
    it(`gives the input back with boost 1 and the base with boost 0 (${base} base)`, () => {
      const params = { base, radius: 3, sigmaSpace: 3 };
      const same = detailEnhanceFilter.plane(plane, { ...params, boost: 1 }, CONTEXT);
      same.data.forEach((v, i) => expect(v).toBeCloseTo(plane.data[i] ?? NaN, 3));
      const flat = detailEnhanceFilter.plane(plane, { ...params, boost: 0 }, CONTEXT);
      const q = detailBase(plane, detailSettings(params), CONTEXT.border);
      flat.data.forEach((v, i) => expect(v).toBeCloseTo(q.data[i] ?? NaN, 3));
    });
  }

  it("leaves a flat image flat, whatever the boost", () => {
    const flat = createPlane(10, 8);
    flat.data.fill(77);
    for (const base of ["guided", "bilateral"]) {
      const out = detailEnhanceFilter.plane(flat, { base, boost: 5 }, CONTEXT);
      out.data.forEach((v) => expect(v).toBeCloseTo(77, 6));
    }
  });
});
