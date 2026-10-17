/**
 * Preset files (PLAN.md Phase 8): saved filter settings, shared as JSON. A file can hold the
 * presets of one filter or of many. On import every value is checked against the catalog, as if
 * it were typed, through the `validate` function the studio passes.
 */
import type { ParamValue } from "@/core/filters/types";

export const PRESETS_FORMAT = "pixelnexus-presets";
export const PRESETS_VERSION = 1;

export interface NamedValues {
  readonly name: string;
  readonly values: Readonly<Record<string, ParamValue>>;
}

export type PresetMap = Readonly<Record<string, readonly NamedValues[]>>;

export function presetsJson(presets: PresetMap): string {
  const kept = Object.fromEntries(Object.entries(presets).filter(([, list]) => list.length > 0));
  return `${JSON.stringify({ format: PRESETS_FORMAT, version: PRESETS_VERSION, presets: kept }, null, 2)}\n`;
}

export function parsePresets(
  text: string,
  validate: (
    filterId: string,
    values: Readonly<Record<string, unknown>>,
  ) => { values: Record<string, ParamValue>; warnings: readonly string[] } | string,
): { presets: Record<string, NamedValues[]>; warnings: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const file = data as { format?: unknown; version?: unknown; presets?: unknown } | null;
  if (!file || typeof file !== "object" || file.format !== PRESETS_FORMAT) {
    throw new Error("This file is not a PixelNexus preset file.");
  }
  if (file.version !== PRESETS_VERSION) {
    throw new Error(
      `This preset file has version ${String(file.version)}. This studio reads version 1.`,
    );
  }
  if (!file.presets || typeof file.presets !== "object")
    throw new Error("This file has no presets.");
  const presets: Record<string, NamedValues[]> = {};
  const warnings: string[] = [];
  for (const [filterId, list] of Object.entries(file.presets as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const raw of list as unknown[]) {
      const item = raw as { name?: unknown; values?: unknown } | null;
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (!name) {
        warnings.push(`A preset of ${filterId} has no name, so it was left out.`);
        continue;
      }
      const values =
        item?.values && typeof item.values === "object"
          ? (item.values as Record<string, unknown>)
          : {};
      const checked = validate(filterId, values);
      if (typeof checked === "string") {
        warnings.push(`"${name}" was left out: ${checked}`);
        continue;
      }
      warnings.push(...checked.warnings.map((w) => `"${name}": ${w}`));
      const target = (presets[filterId] ??= []);
      const same = target.findIndex((p) => p.name === name);
      if (same >= 0) target.splice(same, 1);
      target.push({ name, values: checked.values });
    }
  }
  return { presets, warnings };
}
