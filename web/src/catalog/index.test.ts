import { describe, expect, it } from "vitest";

import { catalog, countBy, isRunnable, STATUS_LABELS } from "@/catalog";

describe("catalog module", () => {
  it("loads every planned entry", () => {
    expect(catalog.filters.length + catalog.tools.length).toBe(337);
    expect(catalog.families).toHaveLength(14);
  });

  it("has a label for every status", () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(7);
    for (const entry of [...catalog.filters, ...catalog.tools]) {
      expect(STATUS_LABELS[entry.status]).toBeTruthy();
    }
  });

  it("never offers planned or unsupported entries as runnable", () => {
    expect(isRunnable({ status: "planned" })).toBe(false);
    expect(isRunnable({ status: "unsupported" })).toBe(false);
    expect(isRunnable({ status: "implemented-tested" })).toBe(true);
  });

  it("counts by key", () => {
    const counts = countBy(["a", "b", "a"], (x) => x);
    expect([...counts]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});
