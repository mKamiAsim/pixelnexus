import { describe, expect, it } from "vitest";

import { parsePresets, presetsJson } from "./presets";

const validate = (filterId: string, values: Readonly<Record<string, unknown>>) => {
  if (filterId !== "gaussian") return `${filterId} is not a filter in this studio.`;
  const sigma = Number(values.sigma ?? 1);
  return sigma > 50
    ? { values: { sigma: 50 }, warnings: ["Sigma was lowered to 50, its largest value."] }
    : { values: { sigma }, warnings: [] };
};

describe("preset files", () => {
  it("saves and reads the same presets, leaving out empty lists", () => {
    const text = presetsJson({ gaussian: [{ name: "Soft", values: { sigma: 3 } }], median: [] });
    expect(JSON.parse(text).presets).toEqual({
      gaussian: [{ name: "Soft", values: { sigma: 3 } }],
    });
    expect(parsePresets(text, validate)).toEqual({
      presets: { gaussian: [{ name: "Soft", values: { sigma: 3 } }] },
      warnings: [],
    });
  });

  it("checks values, keeps the last of two equal names, and leaves out what it cannot use", () => {
    const text = JSON.stringify({
      format: "pixelnexus-presets",
      version: 1,
      presets: {
        gaussian: [
          { name: "Huge", values: { sigma: 99 } },
          { name: "Huge", values: { sigma: 2 } },
          { values: { sigma: 1 } },
        ],
        nope: [{ name: "X", values: {} }],
      },
    });
    const { presets, warnings } = parsePresets(text, validate);
    expect(presets).toEqual({ gaussian: [{ name: "Huge", values: { sigma: 2 } }] });
    expect(warnings).toEqual([
      '"Huge": Sigma was lowered to 50, its largest value.',
      "A preset of gaussian has no name, so it was left out.",
      '"X" was left out: nope is not a filter in this studio.',
    ]);
  });

  it("refuses files that are not preset files", () => {
    expect(() => parsePresets("nope", validate)).toThrow("not valid JSON");
    expect(() => parsePresets('{"format":"pixelnexus-pipeline"}', validate)).toThrow(
      "not a PixelNexus preset file",
    );
    expect(() => parsePresets('{"format":"pixelnexus-presets","version":3}', validate)).toThrow(
      "version 3",
    );
  });
});
