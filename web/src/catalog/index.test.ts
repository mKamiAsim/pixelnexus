import { describe, expect, it } from "vitest";

import { catalog, countBy, isRunnable, modelFor, STATUS_LABELS } from "@/catalog";

describe("catalog module", () => {
  it("loads every entry", () => {
    expect(catalog.filters.length + catalog.tools.length).toBe(317);
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

describe("modelFor", () => {
  const find = (id: string) => {
    const entry = catalog.filters.find((f) => f.id === id);
    if (!entry) throw new Error(`Missing ${id}`);
    return entry;
  };

  it("picks the model by the setting that chooses it", () => {
    expect(modelFor(find("fast-style"), { style: "candy" })).toBe("style-candy");
    expect(modelFor(find("dncnn"), { task: "jpeg" })).toBe("dncnn3");
  });

  it("falls back to the default model, and to none", () => {
    expect(modelFor(find("fast-style"), {})).toBe("style-mosaic");
    expect(modelFor(find("ffdnet"), {})).toBe("ffdnet-color");
    expect(modelFor(find("gaussian"), {})).toBeUndefined();
  });
});
