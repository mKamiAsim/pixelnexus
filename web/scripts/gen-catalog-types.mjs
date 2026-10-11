// Generate TypeScript types from catalog/schema/catalog.schema.json.
// Output: src/generated/catalog-types.ts (not committed, created by "pnpm gen").
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";

const schemaFile = fileURLToPath(
  new URL("../../catalog/schema/catalog.schema.json", import.meta.url),
);
const outFile = fileURLToPath(new URL("../src/generated/catalog-types.ts", import.meta.url));

const schema = JSON.parse(readFileSync(schemaFile, "utf8"));
const source = await compile(schema, "Catalog", {
  bannerComment:
    "/* Generated from catalog/schema/catalog.schema.json by scripts/gen-catalog-types.mjs. Do not edit. */",
  additionalProperties: false,
  unreachableDefinitions: true,
  format: true,
  style: { printWidth: 100, trailingComma: "all" },
});

mkdirSync(new URL("../src/generated/", import.meta.url), { recursive: true });
const previous = (() => {
  try {
    return readFileSync(outFile, "utf8");
  } catch {
    return "";
  }
})();
if (previous !== source) writeFileSync(outFile, source);
