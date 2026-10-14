import { describe, expect, it } from "vitest";

import { otsuThreshold } from "./thresholds";

describe("Otsu threshold", () => {
  it("splits two well separated groups between them", () => {
    const h = new Float64Array(256);
    h[40] = 100;
    h[50] = 50;
    h[200] = 80;
    h[210] = 40;
    const t = otsuThreshold(h);
    expect(t).toBeGreaterThanOrEqual(50);
    expect(t).toBeLessThan(200);
    // Every threshold from 50 to 199 splits the same way, so the first one wins.
    expect(t).toBe(50);
  });

  it("gives a flat image its own level, so nothing is above it", () => {
    const h = new Float64Array(256);
    h[77] = 10;
    expect(otsuThreshold(h)).toBe(77);
  });
});
