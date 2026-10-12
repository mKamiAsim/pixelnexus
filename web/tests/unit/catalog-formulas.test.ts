import katex from "katex";
import { describe, expect, it } from "vitest";

import { catalog } from "../../src/catalog";
import { fillFormula } from "../../src/catalog/formula";
import { defaultValues, resolveParams, validateParams } from "../../src/catalog/params";

/**
 * Plan risk R9: formulas must render in KaTeX (studio) and MathJax (docs). This test compiles
 * every catalog formula and symbol with KaTeX, with the parameter defaults filled in.
 */
const withFormula = [...catalog.filters, ...catalog.tools].filter(
  (entry) => "formula" in entry && entry.formula,
);

const compile = (tex: string) =>
  katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: "ignore" });

describe("catalog formulas compile in KaTeX", () => {
  it.each(withFormula.map((entry) => [entry.id, entry] as const))("%s", (_id, entry) => {
    const params = resolveParams("params" in entry ? entry.params : undefined);
    const tex = fillFormula(entry.formula ?? "", defaultValues(params));
    expect(tex).not.toContain("\\text{?}");
    expect(() => compile(tex)).not.toThrow();
    for (const symbol of "symbols" in entry ? (entry.symbols ?? []) : []) {
      expect(() => compile(symbol.symbol), symbol.symbol).not.toThrow();
    }
  });
});

describe("catalog parameter defaults", () => {
  it.each(catalog.filters.filter((f) => f.params).map((f) => [f.id, f] as const))(
    "%s defaults pass validation unchanged",
    (_id, filter) => {
      const params = resolveParams(filter.params);
      const defaults = defaultValues(params);
      const { values, warnings } = validateParams(params, defaults);
      expect(warnings).toEqual([]);
      expect(values).toEqual(defaults);
    },
  );
});
