import { describe, expect, it } from "vitest";

import { catalog } from "@/catalog";
import { fillFormula } from "@/catalog/formula";
import { defaultValues, resolveParams } from "@/catalog/params";

const gaussian = catalog.filters.find((filter) => filter.id === "gaussian");
const sobel = catalog.filters.find((filter) => filter.id === "sobel");

describe("resolveParams", () => {
  it("expands shared parameters and keeps their options", () => {
    const params = resolveParams(gaussian?.params);
    const border = params.find((param) => param.key === "border");
    expect(border?.type).toBe("select");
    expect(border?.default).toBe("reflect101");
    expect(params.map((param) => param.key)).toEqual([
      "sigma",
      "truncate",
      "border",
      "channelScope",
      "linearLight",
    ]);
  });

  it("applies overrides from the entry", () => {
    const values = defaultValues(resolveParams(sobel?.params));
    expect(values.outputMapping).toBe("normalize");
    expect(values.channelScope).toBe("luminance");
  });
});

describe("fillFormula", () => {
  it("inserts values and marks unknown placeholders", () => {
    expect(
      fillFormula("r = {{truncate}}\\sigma, \\sigma = {{ sigma }}", { truncate: 3, sigma: 1.5 }),
    ).toBe("r = 3\\sigma, \\sigma = 1.5");
    expect(fillFormula("{{missing}}", {})).toBe("\\text{?}");
  });

  it("fills the Gaussian formula from its defaults", () => {
    const filled = fillFormula(
      gaussian?.formula ?? "",
      defaultValues(resolveParams(gaussian?.params)),
    );
    expect(filled).not.toContain("{{");
    expect(filled).toContain("\\sigma = 1");
  });
});
