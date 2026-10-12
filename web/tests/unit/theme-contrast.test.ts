import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { THEMES } from "../../src/styles/themes";

/**
 * Checks every theme in tokens.css against the contrast rules in its header comment.
 * A new theme only needs a token block and an entry in themes.ts. This test does the rest.
 */
const css = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");

function tokensByTheme(): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  const block = /\[data-theme="([a-z]+)"\]\s*\{([^}]*)\}/g;
  for (const match of css.matchAll(block)) {
    const tokens = new Map<string, string>();
    for (const [, name, value] of (match[2] ?? "").matchAll(/--px-([a-z-]+):\s*([^;]+);/g)) {
      tokens.set(name ?? "", (value ?? "").trim());
    }
    result.set(match[1] ?? "", tokens);
  }
  return result;
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

const SURFACES = ["app", "panel", "panel-header", "raised"];
const TEXT = [
  "text",
  "text-secondary",
  "text-muted",
  "accent-fg",
  "success",
  "warning",
  "danger",
  "optional",
];
const themes = tokensByTheme();

describe.each(THEMES.map((theme) => [theme.id] as const))("theme %s", (id) => {
  const tokens = themes.get(id);
  const get = (name: string) => {
    const value = tokens?.get(name);
    if (!value?.startsWith("#")) throw new Error(`${id} has no hex value for --px-${name}`);
    return value;
  };

  it("has a token block", () => {
    expect(tokens).toBeDefined();
  });

  it.each(TEXT)("%s text meets 4.5:1 on every surface", (name) => {
    for (const surface of SURFACES) {
      expect(contrast(get(name), get(surface)), `${name} on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("text on the accent meets 4.5:1", () => {
    expect(contrast(get("on-accent"), get("accent"))).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders and focus rings meet 3:1", () => {
    for (const surface of ["panel", "raised"]) {
      expect(contrast(get("border-control"), get(surface)), surface).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(get("focus"), get("panel"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the canvas a neutral gray", () => {
    const [r, g, b] = channels(get("canvas"));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(4);
  });
});

it("tokens.css has no theme that themes.ts does not list", () => {
  expect([...themes.keys()].sort()).toEqual(THEMES.map((t) => t.id).sort());
});

describe("theme selectors", () => {
  it("never let the default theme override a theme set on <html>", () => {
    // A bare ":root" block after "[data-theme=dark]" has the same specificity and wins, so the
    // dark theme would never show. The default block must exclude any explicit data-theme.
    expect(css).not.toMatch(/^:root\s*[,{]/m);
    expect(css).toMatch(/:root:not\(\[data-theme\]\)/);
  });
});
