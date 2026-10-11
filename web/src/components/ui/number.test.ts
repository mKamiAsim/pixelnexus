import { describe, expect, it } from "vitest";

import { formatNumber, normalizeNumber, parseNumber, stepNumber } from "./number";

describe("numeric parameter rules", () => {
  it("clamps to the range", () => {
    expect(normalizeNumber(99, { min: 0, max: 10 })).toBe(10);
    expect(normalizeNumber(-1, { min: 0, max: 10 })).toBe(0);
  });

  it("snaps to the step without float noise", () => {
    expect(normalizeNumber(0.30000000000000004, { min: 0.1, max: 5, step: 0.1 })).toBe(0.3);
    expect(normalizeNumber(1.26, { min: 0, max: 5, step: 0.05 })).toBe(1.25);
  });

  it("keeps odd-only values odd and inside the range", () => {
    expect(normalizeNumber(4, { min: 3, max: 25, oddOnly: true })).toBe(5);
    expect(normalizeNumber(26, { min: 3, max: 25, oddOnly: true })).toBe(25);
    expect(normalizeNumber(24.6, { min: 3, max: 25, oddOnly: true })).toBe(25);
  });

  it("rejects text that is not a number", () => {
    expect(normalizeNumber(parseNumber("abc"), {})).toBeNull();
    expect(normalizeNumber(parseNumber(""), {})).toBeNull();
    expect(parseNumber("1,5")).toBe(1.5);
  });

  it("steps by one unit, or ten with Shift", () => {
    expect(stepNumber(3, 1, { min: 3, max: 25, oddOnly: true })).toBe(5);
    expect(stepNumber(1, 1, { min: 0, max: 50, step: 0.1 }, true)).toBe(2);
    expect(formatNumber(2, { step: 0.05 })).toBe("2.00");
  });
});
