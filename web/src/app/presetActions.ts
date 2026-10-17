/**
 * Export and import of filter presets (PLAN.md Phase 8). Export writes the presets of one filter,
 * or of all filters, as a JSON file. Import checks every value against the catalog and adds the
 * presets; one with the same name as a saved preset replaces it.
 */
import { entryParams, validateParams } from "@/catalog/params";
import { parsePresets, presetsJson } from "@/core/presets/presets";
import type { ParamValue } from "@/core/filters/types";
import { useFilters } from "@/state/filters";
import { notify } from "@/state/notifications";

import { download } from "./download";
import { filterById } from "./filterActions";

function validatePreset(
  filterId: string,
  values: Readonly<Record<string, unknown>>,
): { values: Record<string, ParamValue>; warnings: readonly string[] } | string {
  const entry = filterById(filterId);
  if (!entry) return `${filterId} is not a filter in this studio.`;
  return validateParams(entryParams(entry), values);
}

/** Save the presets of one filter, or of all filters when none is named. */
export function exportPresets(filterId?: string): void {
  const all = useFilters.getState().presets;
  const chosen = filterId ? { [filterId]: all[filterId] ?? [] } : all;
  const count = Object.values(chosen).reduce((sum, list) => sum + list.length, 0);
  if (count === 0) {
    notify("info", "No presets to export", "Save a preset in Properties first.");
    return;
  }
  const name = filterId ? `presets-${filterId}.json` : "presets.json";
  download(new Blob([presetsJson(chosen)], { type: "application/json" }), name);
  notify("success", `Exported ${count} ${count === 1 ? "preset" : "presets"}`, name);
}

export async function importPresets(file: File): Promise<void> {
  try {
    const { presets, warnings } = parsePresets(await file.text(), validatePreset);
    const count = useFilters.getState().importPresets(presets);
    notify(
      warnings.length ? "warning" : "success",
      `Imported ${count} ${count === 1 ? "preset" : "presets"}`,
      warnings.join(" "),
    );
  } catch (error) {
    notify("error", "Could not import the presets", error instanceof Error ? error.message : "");
  }
}

/** Ask for a preset file and import it. Must run from a click or key press. */
export function chooseAndImportPresets(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void importPresets(file);
  });
  input.click();
}
