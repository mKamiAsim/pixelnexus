/**
 * What the studio does with filters: choose one, read its validated values, apply it to the
 * active image, and describe the result for history, export names and screen readers.
 */
import { catalog, isRunnable, type Filter } from "@/catalog";
import { entryParams, validateParams } from "@/catalog/params";
import { composite } from "@/core/composite/compose";
import { hasPoints, rowsInMask } from "@/core/features/table";
import { fullRect } from "@/core/filters/run";
import { processingRegion, scopeMask, type FilterScope } from "@/core/composite/scope";
import type { ParamValue } from "@/core/filters/types";
import { EngineError, runJob } from "@/engine-client";
import {
  activeDocument,
  activeSelection,
  appliedSteps,
  useDocuments,
  type ImageDocument,
} from "@/state/documents";
import { useFeatures } from "@/state/features";
import { useFilters } from "@/state/filters";
import { announce, notify } from "@/state/notifications";
import { useSettings } from "@/state/settings";
import { useUi } from "@/state/ui";

import { runEntryCommand, scaleSelection } from "./geometryActions";
import { guideImageFor } from "./guide";
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

/** Where a filter works on this document: the chosen scope, or the whole image without a selection. */
export function effectiveScope(doc: ImageDocument | null): FilterScope {
  return activeSelection(doc) ? useFilters.getState().scope : "whole";
}

const SCOPE_SUFFIX: Record<FilterScope, string> = {
  whole: "",
  selection: " inside the selection",
  inverse: " outside the selection",
};

/**
 * True when the result at one pixel depends on the whole image, so a part of the image cannot
 * be processed alone. Today that is the "stretch to range" output mapping.
 */
export const isGlobal = (values: Readonly<Record<string, ParamValue>>) =>
  values.outputMapping === "normalize";

/**
 * The scope of a filter. A filter that reads the selection, such as inpainting, works inside
 * it, or outside it with the inverse scope.
 */
function selectionScope(entry: Filter, doc: ImageDocument): FilterScope {
  const scope = effectiveScope(doc);
  return entry.needsSelection && scope === "whole" ? "selection" : scope;
}

/** For a filter that enlarges the image: false, with a message, when the result is too large. */
function fitsLimits(image: { width: number; height: number }, scale: number): boolean {
  const width = image.width * scale;
  const height = image.height * scale;
  const { maxPixels, maxSide } = useSettings.getState().limits;
  if (width * height <= maxPixels && Math.max(width, height) <= maxSide) return true;
  notify(
    "error",
    "The result would be too large",
    `It would be ${width} x ${height} pixels. The image limits in Preferences allow ${(maxPixels / 1e6).toFixed(0)} million pixels and ${maxSide} pixels per side.`,
  );
  return false;
}

/**
 * Apply the selected filter to the active image, through workers. With a selection, only the
 * selected part is processed and the result is blended in through the mask.
 */
export async function applySelected(): Promise<void> {
  const filters = useFilters.getState();
  const entry = filterById(filters.selectedId);
  const doc = activeDocument();
  if (!entry || !doc || filters.applying) return;
  if (entry.command) {
    // Resize and rotation change the image size, so their dialogs run them.
    runEntryCommand(entry.command);
    return;
  }
  if (!isRunnable(entry)) {
    notify("info", `${entry.name} cannot run yet.`);
    return;
  }
  const source = doc.current;
  const { values } = filterValues(entry);
  const selection = activeSelection(doc);
  if (entry.needsSelection && !selection) {
    notify(
      "info",
      "Select the area first",
      `${entry.name} works on the selection. Make a selection, then apply again.`,
    );
    return;
  }
  const resizes = entry.changesSize === true;
  // A template or markers selection is only an input. The filter runs on, and changes, the
  // whole image.
  const template =
    entry.needsSelection === true &&
    (entry.selectionRole === "template" || entry.selectionRole === "markers");
  if (resizes && !fitsLimits(source, Number(values.scale))) return;
  // Feature detectors and tables look at the whole image. A selection only chooses which
  // features to keep.
  const finds =
    entry.output === "features" || entry.output === "table" || entry.output === "labels";
  const scope = resizes || template ? "whole" : selectionScope(entry, doc);
  const mask = scopeMask(selection, scope);
  // The selection the filter reads: the template itself, or the area it changes.
  const input = template ? selection : mask;
  const region =
    resizes || finds ? fullRect(source) : processingRegion(source, mask, isGlobal(values));
  if (template && selection && !processingRegion(source, selection, false)) {
    notify("info", "Nothing to search for", "The selection is empty.");
    return;
  }
  if (finds && mask && !processingRegion(source, mask, false)) {
    notify("info", "Nothing to search", "The selection is empty.");
    return;
  }
  if (!region) {
    notify(
      "info",
      "Nothing to change",
      scope === "inverse"
        ? "The selection covers the whole image, so nothing is outside it."
        : "The selection is empty.",
    );
    return;
  }
  const label = `${stepLabel(entry, values)}${SCOPE_SUFFIX[scope]}`;
  const controller = new AbortController();
  filters.setApplying({ filterId: entry.id, progress: 0, controller });
  const { beginWork, endWork } = useUi.getState();
  beginWork(`Applying ${entry.name}`);
  announce(`Applying ${entry.name}.`);
  try {
    const guide = guideImageFor(entry, values, doc);
    const result = await runJob(
      {
        filterId: entry.id,
        values,
        image: source,
        region,
        ...(guide ? { guide } : {}),
        ...(entry.needsSelection && input ? { hole: input } : {}),
      },
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
    const ms = Math.round(result.timing.totalMs);
    if (result.features) {
      // Regions cover the whole image, so their table stays whole too.
      const labels = result.labels;
      const table = labels ? result.features : rowsInMask(result.features, mask);
      useFeatures
        .getState()
        .set(doc.id, { filterId: entry.id, label, source, table, ...(labels ? { labels } : {}) });
      useFilters
        .getState()
        .setLastRun(entry.id, { kind: "apply", ...result.timing, at: Date.now() });
      showPanel("features");
      if (labels) {
        notify(
          "success",
          `${entry.name} found ${table.summary}`,
          [
            `${ms} ms. The image does not change. The Features panel lists them, and can select them.`,
            ...(mask ? ["The regions cover the whole image, not only the selection."] : []),
          ].join(" "),
        );
      } else if (hasPoints(table)) {
        notify(
          "success",
          `${entry.name} found ${table.summary}`,
          `${ms} ms. The image does not change. The Features panel lists them.`,
        );
      } else {
        notify(
          "success",
          `${entry.name} made a table of ${table.summary}`,
          [
            `${ms} ms. The image does not change. The Features panel shows the table.`,
            ...(mask ? ["The table describes the whole image, not only the selection."] : []),
          ].join(" "),
        );
      }
      return;
    }
    if (resizes) {
      // The result replaces the image, and the selection grows with it.
      const { width, height } = result.image;
      const scaled = doc.selection ? scaleSelection(doc.selection, width, height) : undefined;
      useDocuments
        .getState()
        .edit(doc.id, result.image, label, { id: entry.id, params: values }, scaled);
    } else {
      const image = composite(source, result.image, result.region, mask);
      useDocuments.getState().edit(doc.id, image, label, {
        id: entry.id,
        params: values,
        ...(scope === "whole" ? {} : { scope }),
      });
    }
    useFilters.getState().setLastRun(entry.id, { kind: "apply", ...result.timing, at: Date.now() });
    // A preview of the new image would show the filter twice, so the preview turns off.
    useFilters.getState().setPreviewOn(false);
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
