/**
 * What the studio does with filters: choose one, read its validated values, apply it to the
 * active image, and describe the result for history, export names and screen readers.
 */
import { catalog, isRunnable, type Filter } from "@/catalog";
import { entryParams, validateParams } from "@/catalog/params";
import { composite } from "@/core/composite/compose";
import type { ParamValue } from "@/core/filters/types";
import { EngineError, runJob } from "@/engine-client";
import { activeDocument, appliedSteps, useDocuments, type ImageDocument } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { announce, notify } from "@/state/notifications";
import { useUi } from "@/state/ui";

import { showPanel, workspaceApi } from "./layout";

export function filterById(id: string | null): Filter | null {
  return id ? (catalog.filters.find((f) => f.id === id) ?? null) : null;
}

/** The validated values for a filter: what the user set, with catalog defaults for the rest. */
export function filterValues(entry: Filter): {
  values: Record<string, ParamValue>;
  warnings: readonly string[];
} {
  return validateParams(entryParams(entry), useFilters.getState().values[entry.id] ?? {});
}

const FILTER_PANELS = ["properties", "inspector", "learn", "developer"] as const;

/**
 * Choose a filter. When none of the filter panels is showing, bring Properties to the front.
 * A visible Learn or Inspector panel stays, so a lesson is not interrupted.
 */
export function selectFilter(id: string): void {
  useFilters.getState().select(id);
  const dock = workspaceApi();
  const showing = FILTER_PANELS.some((panel) => dock?.getPanel(panel)?.api.isVisible);
  if (!showing) showPanel("properties");
}

const formatValue = (value: ParamValue, unit?: string) =>
  `${typeof value === "number" ? Number(value.toFixed(2)) : String(value)}${unit && unit !== "levels" ? ` ${unit}` : ""}`;

/**
 * A short label for a history step, for example "Gaussian filter (sigma 2 px)". It names the
 * main parameters, not the shared ones such as the border mode.
 */
export function stepLabel(entry: Filter, values: Readonly<Record<string, ParamValue>>): string {
  const params = entryParams(entry).filter(
    (p) => !p.advanced && !["border", "channelScope", "outputMapping", "seed"].includes(p.key),
  );
  const parts = params.slice(0, 3).map((p) => {
    const value = values[p.key] ?? p.default;
    if (p.type === "select") {
      const option = p.options?.find((o) => o.value === value);
      // "Horizontal change (Gx)" becomes "Horizontal change", to keep history labels short.
      const label = (option?.label ?? String(value)).split(" (")[0];
      return `${p.label.toLowerCase()} ${label}`;
    }
    if (p.type === "boolean") return `${p.label.toLowerCase()} ${value ? "on" : "off"}`;
    return `${p.label.toLowerCase()} ${formatValue(value, p.unit)}`;
  });
  return parts.length ? `${entry.name} (${parts.join(", ")})` : entry.name;
}

/**
 * The export name suffix for the last filter step, for example "gaussian_sigma-2", as in
 * "photo_gaussian_sigma-2.png". Empty when no filter was applied.
 */
export function exportSuffix(doc: ImageDocument): string {
  const step = [...appliedSteps(doc)].reverse().find((s) => s.filter);
  if (!step?.filter) return "";
  const entry = filterById(step.filter.id);
  const main = entry
    ? entryParams(entry).find((p) => ["number", "integer", "angle", "select"].includes(p.type))
    : undefined;
  const value = main ? step.filter.params[main.key] : undefined;
  return main && value !== undefined
    ? `${step.filter.id}_${main.key}-${String(typeof value === "number" ? Number(value.toFixed(2)) : value)}`
    : step.filter.id;
}

/** Apply the selected filter to the whole active image, through workers. */
export async function applySelected(): Promise<void> {
  const filters = useFilters.getState();
  const entry = filterById(filters.selectedId);
  const doc = activeDocument();
  if (!entry || !doc || filters.applying) return;
  if (!isRunnable(entry)) {
    notify("info", `${entry.name} cannot run yet.`);
    return;
  }
  const source = doc.current;
  const { values } = filterValues(entry);
  const label = stepLabel(entry, values);
  const controller = new AbortController();
  filters.setApplying({ filterId: entry.id, progress: 0, controller });
  const { beginWork, endWork } = useUi.getState();
  beginWork(`Applying ${entry.name}`);
  announce(`Applying ${entry.name}.`);
  try {
    const result = await runJob(
      { filterId: entry.id, values, image: source },
      {
        signal: controller.signal,
        onProgress: (fraction) => useFilters.getState().setProgress(fraction),
      },
    );
    const now = activeDocument();
    if (now?.id !== doc.id || now.current !== source) {
      notify(
        "warning",
        "The image changed while the filter ran",
        "Nothing was applied. Apply again to use the new image.",
      );
      return;
    }
    const image = composite(source, result.image, result.region);
    useDocuments.getState().edit(doc.id, image, label, { id: entry.id, params: values });
    useFilters.getState().setLastRun(entry.id, { kind: "apply", ...result.timing, at: Date.now() });
    // A preview of the new image would show the filter twice, so the preview turns off.
    useFilters.getState().setPreviewOn(false);
    const ms = Math.round(result.timing.totalMs);
    notify(
      result.warnings.length ? "warning" : "success",
      `Applied ${label}`,
      [`${ms} ms.`, ...result.warnings].join(" "),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      notify("info", `${entry.name} was cancelled.`);
    } else {
      const message =
        error instanceof EngineError || error instanceof Error
          ? error.message
          : "The filter failed.";
      notify("error", `${entry.name} failed`, message);
    }
  } finally {
    useFilters.getState().setApplying(null);
    endWork();
  }
}

export function cancelApply(): void {
  useFilters.getState().applying?.controller.abort();
}
