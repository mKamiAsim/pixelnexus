/**
 * Vite plugin that loads the catalog YAML files, validates them against
 * catalog/schema/catalog.schema.json and exposes the result as the virtual module
 * "virtual:pixelnexus-catalog".
 *
 * The Python loader in tools/catalog_lib.py builds the same bundle shape from the same files
 * and checks the same schema. It also runs the cross-reference checks (tools/check_catalog.py).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { Plugin } from "vite";
import { parse } from "yaml";

export const VIRTUAL_ID = "virtual:pixelnexus-catalog";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export const DEFAULT_CATALOG_DIR = fileURLToPath(new URL("../../catalog", import.meta.url));

const LIST_FILES = {
  families: ["families.yaml", "families"],
  glossary: ["glossary.yaml", "terms"],
  commonParams: ["common-params.yaml", "params"],
  models: ["models.yaml", "models"],
  providers: ["providers.yaml", "providers"],
} as const;

export interface LoadedCatalog {
  bundle: Record<string, unknown[]>;
  /** Source file of every item, per section, for error messages. */
  origins: Record<string, string[]>;
  files: string[];
}

function yamlFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function readYaml(file: string): unknown {
  return parse(readFileSync(file, "utf8"));
}

/** Read every catalog file into one bundle. */
export function loadCatalog(catalogDir: string = DEFAULT_CATALOG_DIR): LoadedCatalog {
  const bundle: Record<string, unknown[]> = {};
  const origins: Record<string, string[]> = {};
  const files: string[] = [];

  for (const [section, [fileName, key]] of Object.entries(LIST_FILES)) {
    const file = path.join(catalogDir, fileName);
    const data = (readYaml(file) ?? {}) as Record<string, unknown[] | undefined>;
    const items = data[key] ?? [];
    bundle[section] = items;
    origins[section] = items.map(() => file);
    files.push(file);
  }
  for (const section of ["filters", "tools"]) {
    const sectionFiles = yamlFiles(path.join(catalogDir, section));
    bundle[section] = sectionFiles.map(readYaml);
    origins[section] = sectionFiles;
    files.push(...sectionFiles);
  }
  return { bundle, origins, files };
}

function describe(error: ErrorObject, loaded: LoadedCatalog, catalogDir: string): string {
  const [section, index, ...rest] = error.instancePath.split("/").filter(Boolean);
  const file = section && index ? loaded.origins[section]?.[Number(index)] : undefined;
  const where = file ? path.relative(path.dirname(catalogDir), file) : error.instancePath;
  const detail = rest.length ? `:${rest.join("/")}` : "";
  const extra =
    error.keyword === "additionalProperties" ? ` (${String(error.params.additionalProperty)})` : "";
  return `${where}${detail}: ${error.message ?? "invalid"}${extra}`;
}

/** Validate a bundle. Returns readable error lines, or an empty list. */
export function validateCatalog(
  loaded: LoadedCatalog,
  catalogDir: string = DEFAULT_CATALOG_DIR,
): string[] {
  const schemaFile = path.join(catalogDir, "schema", "catalog.schema.json");
  const schema = JSON.parse(readFileSync(schemaFile, "utf8")) as object;
  // strictRequired is off because the schema uses "required" inside if/then blocks, which is valid.
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
  });
  const validate = ajv.compile(schema);
  if (validate(loaded.bundle)) return [];
  return (validate.errors ?? []).map((error) => describe(error, loaded, catalogDir));
}

export function catalogPlugin(catalogDir: string = DEFAULT_CATALOG_DIR): Plugin {
  return {
    name: "pixelnexus-catalog",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const loaded = loadCatalog(catalogDir);
      for (const file of loaded.files) this.addWatchFile(file);
      const errors = validateCatalog(loaded, catalogDir);
      if (errors.length > 0) {
        throw new Error(`Catalog is invalid:\n  ${errors.join("\n  ")}`);
      }
      return `export default ${JSON.stringify(loaded.bundle)};`;
    },
    configureServer(server) {
      server.watcher.add(catalogDir);
      server.watcher.on("all", (_event, file) => {
        if (!file.startsWith(catalogDir)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
