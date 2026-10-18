// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { useFilters } from "@/state/filters";
import { useNotices } from "@/state/notifications";

import { importPresets } from "./presetActions";

describe("importing presets", () => {
  it("validates against the catalog and replaces presets with the same name", async () => {
    useFilters.getState().savePreset("gaussian", { name: "Soft", values: { sigma: 1 } });
    const file = new File(
      [
        JSON.stringify({
          format: "pixelnexus-presets",
          version: 1,
          presets: {
            gaussian: [{ name: "Soft", values: { sigma: 4 } }],
            "no-such-filter": [{ name: "X", values: {} }],
          },
        }),
      ],
      "presets.json",
    );
    await importPresets(file);
    expect(useFilters.getState().presets.gaussian?.map((p) => [p.name, p.values.sigma])).toEqual([
      ["Soft", 4],
    ]);
    const notice = useNotices.getState().notices.at(-1);
    expect(notice?.title).toBe("Imported 1 preset");
    expect(notice?.detail).toContain("no-such-filter is not a filter in this studio.");
  });
});
