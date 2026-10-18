import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG_DIR, loadCatalog, validateCatalog } from "../../build/catalog-plugin.ts";

describe("catalog plugin", () => {
  it("loads and validates the repository catalog", () => {
    const loaded = loadCatalog();
    expect(validateCatalog(loaded)).toEqual([]);
    expect(loaded.bundle.filters).toHaveLength(297);
    expect(loaded.bundle.tools).toHaveLength(20);
  });

  it("reports the file and field of a schema error", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pixelnexus-catalog-"));
    cpSync(DEFAULT_CATALOG_DIR, dir, { recursive: true });
    const file = path.join(dir, "filters", "linear", "box.yaml");
    writeFileSync(file, readFileSync(file, "utf8").replace("tier: core", "tier: legendary"));

    const errors = validateCatalog(loadCatalog(dir), dir);
    expect(errors.some((line) => line.includes("box.yaml:tier"))).toBe(true);
  });
});
