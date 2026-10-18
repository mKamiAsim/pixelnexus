import { describe, expect, it } from "vitest";

import { catalog, isRunnable } from "@/catalog";

import { DEFAULT_FACETS, facetValues, groupByFamily, scoreFilter, searchFilters } from "./library";

const ids = (query: string, facets = DEFAULT_FACETS) =>
  searchFilters(catalog.filters, query, facets).map((f) => f.id);

describe("library search", () => {
  it("finds filters by name, alias and purpose", () => {
    expect(ids("gaussian")[0]).toBe("gaussian");
    expect(ids("mean filter")).toContain("box");
    expect(ids("sharpen")).toContain("unsharp-mask");
    expect(ids("impulse")).toContain("median");
  });

  it("ranks name matches above other matches", () => {
    const gaussian = catalog.filters.find((f) => f.id === "gaussian");
    const median = catalog.filters.find((f) => f.id === "median");
    if (!gaussian || !median) throw new Error("missing entries");
    expect(scoreFilter(gaussian, "gauss")).toBeGreaterThan(scoreFilter(median, "gauss"));
  });

  it("requires every word to match", () => {
    expect(ids("gaussian qqqq")).toEqual([]);
  });

  it("filters by status, family and linearity", () => {
    const runnable = ids("", { ...DEFAULT_FACETS, status: "runnable" });
    expect(runnable.length).toBeGreaterThan(0);
    expect(
      runnable.every((id) =>
        isRunnable(catalog.filters.find((f) => f.id === id) ?? { status: "planned" }),
      ),
    ).toBe(true);
    expect(ids("", { ...DEFAULT_FACETS, family: "edges" })).toContain("laplacian");
    expect(ids("", { ...DEFAULT_FACETS, status: "runnable", linearity: "nonlinear" })).toContain(
      "median",
    );
    expect(
      ids("", { ...DEFAULT_FACETS, status: "runnable", linearity: "nonlinear" }),
    ).not.toContain("box");
  });

  it("filters by purpose and noise tags", () => {
    expect(facetValues(catalog.filters, "noise")).toContain("impulse");
    expect(ids("", { ...DEFAULT_FACETS, noise: "impulse" })).toContain("median");
    expect(ids("", { ...DEFAULT_FACETS, purpose: "sharpening" })).toContain("unsharp-mask");
  });

  it("shows every catalog filter when nothing is filtered", () => {
    expect(ids("")).toHaveLength(catalog.filters.length);
    const grouped = groupByFamily(catalog.filters);
    expect(grouped.reduce((n, g) => n + g.filters.length, 0)).toBe(catalog.filters.length);
  });
});
