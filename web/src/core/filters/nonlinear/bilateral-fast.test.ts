import { describe, expect, it } from "vitest";

import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";

import { bilateralPlanes, bilateralPlanesReference, lumaPlane, type RangeMode } from "./bilateral";

function randomPlanes(width: number, height: number, seed: number): [Plane, Plane, Plane] {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) % 256;
  const plane = () => {
    const p = createPlane(width, height);
    for (let i = 0; i < p.data.length; i++) p.data[i] = next();
    return p;
  };
  return [plane(), plane(), plane()];
}

const BORDERS: BorderMode[] = ["reflect101", "reflect", "replicate", "constant", "wrap"];

describe("the fast bilateral path", () => {
  for (const mode of ["channel", "color"] as RangeMode[]) {
    for (const border of BORDERS) {
      it(`equals the plain loop exactly, ${mode} mode, ${border} border`, () => {
        const planes = randomPlanes(23, 17, mode === "color" ? 7 : 11);
        const fast = bilateralPlanes(planes, planes, mode, 2, 30, border);
        const plain = bilateralPlanesReference(planes, planes, mode, 2, 30, border);
        for (let c = 0; c < 3; c++) {
          expect(Array.from(fast[c].data)).toEqual(Array.from(plain[c].data));
        }
      });
    }
  }

  it("equals the plain loop with a one-plane guide, and falls back for fractions", () => {
    const planes = randomPlanes(19, 13, 3);
    const gray = randomPlanes(19, 13, 5)[0];
    const fast = bilateralPlanes(planes, [gray], "color", 1.5, 20, "reflect");
    const plain = bilateralPlanesReference(planes, [gray], "color", 1.5, 20, "reflect");
    expect(Array.from(fast[1].data)).toEqual(Array.from(plain[1].data));
    // Luma has fractions, so the plain loop runs, and the results match by definition.
    const luma = lumaPlane(planes);
    const withLuma = bilateralPlanes(planes, [luma], "color", 1.5, 20, "reflect");
    const plainLuma = bilateralPlanesReference(planes, [luma], "color", 1.5, 20, "reflect");
    expect(Array.from(withLuma[0].data)).toEqual(Array.from(plainLuma[0].data));
  });
});
