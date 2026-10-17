/**
 * What the Pipeline panel does (PLAN.md Phase 8): add the selected filter or the filter steps of
 * the history, run the chain, and save or load it as JSON.
 *
 * A run starts from the original image of the active document, so the same pipeline always gives
 * the same result. The result becomes one history step. A step with the selection scope uses the
 * document's selection at the time of the run, when it still fits the image. Results are cached
 * per document, so a run after a change recomputes only the changed step and the ones after it.
 */
import { isRunnable, type Filter } from "@/catalog";
import { entryParams, validateParams } from "@/catalog/params";
import { composite } from "@/core/composite/compose";
import { processingRegion, scopeMask } from "@/core/composite/scope";
import type { ParamValue } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";
import {
  newStepId,
  parsePipeline,
  pipelineJson,
  runPipeline,
  type PipelineStep,
  type StepScope,
} from "@/core/pipeline/pipeline";
import { runJob } from "@/engine-client";
import { activeDocument, activeSelection, appliedSteps, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { announce, notify } from "@/state/notifications";
import { usePipeline } from "@/state/pipeline";
import { useUi } from "@/state/ui";

import { isModelFilter } from "./aiLabel";
import { download } from "./download";
import { filterById, filterValues, isGlobal, stepLabel } from "./filterActions";

/** Why a filter cannot be a pipeline step, or null when it can. */
export function pipelineProblem(entry: Filter): string | null {
  if (!isRunnable(entry)) return `${entry.name} cannot run yet.`;
  if (entry.command) return `${entry.name} runs from its own dialog, not in a pipeline.`;
  if (entry.output && entry.output !== "image") {
    return `${entry.name} makes a table or features, not an image.`;
  }
  if (entry.needsSelection) return `${entry.name} needs a selection as its input.`;
  return null;
}

/** Check one saved step: the filter must exist and fit, and its values are validated. */
export function validateStep(
  filterId: string,
  params: Readonly<Record<string, unknown>>,
): { values: Record<string, ParamValue>; warnings: readonly string[] } | string {
  const entry = filterById(filterId);
  if (!entry) return `${filterId} is not a filter in this studio.`;
  return pipelineProblem(entry) ?? validateParams(entryParams(entry), params);
}

export function describeStep(step: PipelineStep): string {
  const entry = filterById(step.filterId);
  const name = entry ? stepLabel(entry, step.params) : step.filterId;
  return step.scope === "selection"
    ? `${name} inside the selection`
    : step.scope === "inverse"
      ? `${name} outside the selection`
      : name;
}

/** Add the filter selected in the Library, with its current values. */
export function addSelectedFilter(): void {
  const entry = filterById(useFilters.getState().selectedId);
  if (!entry) {
    notify("info", "Choose a filter first", "Pick one in the Library, then add it.");
    return;
  }
  const problem = pipelineProblem(entry);
  if (problem) {
    notify("info", "This filter cannot be a pipeline step", problem);
    return;
  }
  const doc = activeDocument();
  const scope: StepScope = activeSelection(doc) ? useFilters.getState().scope : "whole";
  const step: PipelineStep = {
    id: newStepId(),
    filterId: entry.id,
    params: filterValues(entry).values,
    enabled: true,
    scope,
  };
  usePipeline.getState().add(step);
  announce(`Added ${describeStep(step)} to the pipeline.`);
}

/** Make the pipeline from the filter steps of the active image's history. */
export function pipelineFromHistory(): void {
  const doc = activeDocument();
  if (!doc) return;
  const steps: PipelineStep[] = [];
  for (const h of appliedSteps(doc)) {
    const entry = h.filter ? filterById(h.filter.id) : null;
    if (!h.filter || !entry || pipelineProblem(entry)) continue;
    steps.push({
      id: newStepId(),
      filterId: h.filter.id,
      params: h.filter.params,
      enabled: true,
      scope: h.filter.scope ?? "whole",
    });
  }
  if (steps.length === 0) {
    notify(
      "info",
      "No filter steps in the history",
      "Apply a filter first, or add steps one by one.",
    );
    return;
  }
  usePipeline.getState().replace(steps);
  notify("success", `Made a pipeline of ${steps.length} ${steps.length === 1 ? "step" : "steps"}`);
}

/** Results per document, by step key. A closed document's results go with it. */
const caches = new Map<string, Map<string, RgbaImage>>();

function cacheFor(documentId: string): Map<string, RgbaImage> {
  for (const id of caches.keys()) {
    if (!useDocuments.getState().documents.some((d) => d.id === id)) caches.delete(id);
  }
  let cache = caches.get(documentId);
  if (!cache) {
    cache = new Map();
    caches.set(documentId, cache);
  }
  return cache;
}

/** Run the pipeline on the original of the active image, and add the result as one step. */
export async function runPipelineOnActive(): Promise<void> {
  const doc = activeDocument();
  const { steps, running } = usePipeline.getState();
  if (!doc || running) return;
  const on = steps.filter((s) => s.enabled);
  if (on.length === 0) {
    notify("info", "Nothing to run", "Add a step, or turn one on.");
    return;
  }
  const selection = activeSelection(doc);
  const controller = new AbortController();
  usePipeline.getState().setRunning(controller);
  const { beginWork, endWork } = useUi.getState();
  beginWork("Running the pipeline");
  announce("Running the pipeline.");
  const runStep = async (step: PipelineStep, image: RgbaImage, signal?: AbortSignal) => {
    const fits = selection && selection.width === image.width && selection.height === image.height;
    if (step.scope !== "whole" && !fits) {
      throw new Error(
        selection
          ? "The selection does not fit the image at this step, since an earlier step changed its size."
          : "This step works on the selection. Make a selection first.",
      );
    }
    const mask = fits ? scopeMask(selection, step.scope) : null;
    const region = processingRegion(image, mask, isGlobal(step.params));
    if (!region) return image;
    const result = await runJob(
      { filterId: step.filterId, values: step.params, image, region },
      signal ? { signal } : {},
    );
    // A result that fills its region goes back through the compositor. Another size means the
    // filter changed the image size, as an enlargement does, and the result replaces the image.
    const fills =
      result.image.width === result.region.width && result.image.height === result.region.height;
    if (fills) return composite(image, result.image, result.region, mask);
    if (mask) throw new Error("A step that changes the image size cannot work on the selection.");
    return result.image;
  };
  try {
    const started = performance.now();
    const result = await runPipeline(doc.original, steps, {
      inputKey: doc.id,
      cache: cacheFor(doc.id),
      runStep,
      onState: (id, state) => usePipeline.getState().setState(id, state),
      signal: controller.signal,
    });
    const now = activeDocument();
    if (now?.id !== doc.id) {
      notify("warning", "Another image is active now", "Nothing was applied. Run again.");
      return;
    }
    const label = `Pipeline (${on.length} ${on.length === 1 ? "step" : "steps"})`;
    const ai = on.some((s) => isModelFilter(s.filterId));
    useDocuments.getState().edit(doc.id, result, label, undefined, undefined, ai);
    notify(
      "success",
      `Ran the pipeline on the original image`,
      `${on.length} ${on.length === 1 ? "step" : "steps"} in ${Math.round(performance.now() - started)} ms. The result is a new history step.`,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      notify("info", "The pipeline was cancelled.");
    } else {
      notify(
        "error",
        "The pipeline stopped",
        error instanceof Error ? error.message : "A step failed.",
      );
    }
  } finally {
    usePipeline.getState().setRunning(null);
    endWork();
  }
}

export function cancelPipeline(): void {
  usePipeline.getState().running?.abort();
}

export function savePipeline(): void {
  const { steps } = usePipeline.getState();
  if (steps.length === 0) return;
  download(new Blob([pipelineJson(steps)], { type: "application/json" }), "pipeline.json");
}

export async function loadPipeline(file: File): Promise<void> {
  try {
    const { steps, warnings } = parsePipeline(await file.text(), validateStep);
    usePipeline.getState().replace(steps);
    notify(
      warnings.length ? "warning" : "success",
      `Loaded a pipeline of ${steps.length} ${steps.length === 1 ? "step" : "steps"}`,
      warnings.join(" "),
    );
  } catch (error) {
    notify("error", "Could not load the pipeline", error instanceof Error ? error.message : "");
  }
}
