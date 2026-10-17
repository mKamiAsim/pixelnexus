// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_LIMITS } from "@/core/image/limits";

import { historyLimits } from "./documents";
import { DEFAULT_SETTINGS, loadSettings, useSettings } from "./settings";

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
      history: DEFAULT_SETTINGS.history,
    });
  });

  it("reads the history limits and gives them to the documents store", () => {
    localStorage.setItem(KEY, JSON.stringify({ history: { steps: 80, megabytes: -1 } }));
    expect(loadSettings().history).toEqual({
      steps: 80,
      megabytes: DEFAULT_SETTINGS.history.megabytes,
    });
    useSettings.getState().setHistory({ steps: 10, megabytes: 100 });
    expect(historyLimits).toEqual({ steps: 11, bytes: 100 * 1024 * 1024 });
    useSettings.getState().reset();
    expect(historyLimits.steps).toBe(51);
  });

  it("survives text that is not JSON", () => {
    localStorage.setItem(KEY, "{oops");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
