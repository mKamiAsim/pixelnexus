import { describe, expect, it } from "vitest";

import { catalog, isRunnable } from "@/catalog";

import { LATER_DEMOS, WIDGETS } from "./registry";

describe("Learn demos", () => {
  it("has a widget or a planned phase for every demo in the catalog", () => {
    const demos = new Set(catalog.filters.flatMap((f) => f.learn?.demos ?? []));
    const missing = [...demos].filter((d) => !(d in WIDGETS) && !(d in LATER_DEMOS));
    expect(missing).toEqual([]);
  });

  it("gives every runnable filter at least one demo that is built", () => {
    const without = catalog.filters
      .filter((f) => isRunnable(f) && f.learn)
      .filter((f) => !(f.learn?.demos ?? []).some((d) => d in WIDGETS))
      .map((f) => f.id);
    expect(without).toEqual([]);
  });
});
