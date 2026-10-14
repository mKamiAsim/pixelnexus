import { describe, expect, it } from "vitest";

import { catalog, isRunnable } from "@/catalog";
import { equalizeTable } from "@/core/filters/enhancement/histogram";

import { curveOf, stagesOf } from "./common";
import { LATER_DEMOS, WIDGETS } from "./registry";

describe("Learn demos", () => {
  it("has a widget or a planned phase for every demo in the catalog", () => {
    const demos = new Set(catalog.filters.flatMap((f) => f.learn?.demos ?? []));
    const missing = [...demos].filter((d) => !(d in WIDGETS) && !(d in LATER_DEMOS));
    expect(missing).toEqual([]);
  });

  it("gives every runnable filter at least one demo that is built", () => {
    // Entries that run through a command, such as Resize, change the image size. The demos
    // run filters on a patch, so these entries teach with text only.
    const without = catalog.filters
      .filter((f) => isRunnable(f) && f.learn && !f.command)
      .filter((f) => !(f.learn?.demos ?? []).some((d) => d in WIDGETS))
      .map((f) => f.id);
    expect(without).toEqual([]);
  });

  it("finds the stages of every filter that uses the Stage viewer", () => {
    const users = catalog.filters.filter((f) => f.learn?.demos.includes("stage-viewer"));
    expect(users.length).toBeGreaterThan(0);
    for (const f of users) expect(stagesOf(f.id).stages.length).toBeGreaterThan(1);
    expect(stagesOf("canny").stages.map((s) => s.value)).toEqual([
      "smoothed",
      "magnitude",
      "suppressed",
      "thresholds",
      "edges",
    ]);
  });
});

describe("the Point-op curve", () => {
  it("draws the curve each filter really applies", () => {
    const counts = Float64Array.from({ length: 256 }, (_, k) => (k % 3) + 1);
    expect(curveOf("histogram-eq", {}, counts)).toEqual(Array.from(equalizeTable(counts)));
    expect(curveOf("invert", {}, counts)?.[200]).toBe(55);
    expect(curveOf("gaussian", {}, counts)).toBeNull();
  });
});
