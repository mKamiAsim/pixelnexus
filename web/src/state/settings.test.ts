// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_LIMITS } from "@/core/image/limits";

import { DEFAULT_SETTINGS, loadSettings } from "./settings";

const KEY = "pixelnexus.settings.v1";

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("uses the defaults when nothing is saved", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and replaces broken ones", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        limits: { maxFileBytes: 1000, maxPixels: -5, maxSide: "big" },
        rulers: true,
      }),
    );
    expect(loadSettings()).toEqual({
      limits: {
        maxFileBytes: 1000,
        maxPixels: DEFAULT_LIMITS.maxPixels,
        maxSide: DEFAULT_LIMITS.maxSide,
      },
      rulers: true,
    });
  });

  it("survives text that is not JSON", () => {
    localStorage.setItem(KEY, "{oops");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
