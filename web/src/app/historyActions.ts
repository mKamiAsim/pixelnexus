/**
 * Delete a history step (PLAN.md Phase 8). The steps after it are recomputed from the step before
 * it: a filter step runs its filter again with its recorded values and scope, and a step that only
 * changed the selection keeps that selection. A step that cannot be run again, such as a rotation,
 * an AI result or a pipeline run, blocks the delete, and the message names it. Nothing changes
 * until every later step is recomputed.
 */
import type { Mask } from "@/core/mask/mask";
import { useDocuments, type HistoryStep, type ImageDocument } from "@/state/documents";
import { announce, notify } from "@/state/notifications";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

import { filterById } from "./filterActions";
import { scaleSelection } from "./geometryActions";
import { pipelineProblem } from "./pipelineActions";
import { replayFilter } from "./replay";

/** How a later step is redone, or why it cannot be. */
export type Redo =
  | { readonly kind: "filter" }
  | { readonly kind: "selection" }
  | { readonly kind: "blocked"; readonly reason: string };

export function redoKind(step: HistoryStep, before: HistoryStep): Redo {
  if (step.filter) {
    const entry = filterById(step.filter.id);
    const problem = entry ? pipelineProblem(entry) : "Its filter is not in this studio.";
    return problem ? { kind: "blocked", reason: problem } : { kind: "filter" };
  }
  if (step.image === before.image) return { kind: "selection" };
  return { kind: "blocked", reason: "It cannot be run again." };
}

/** Why a step cannot be deleted, or null when it can. */
export function deleteProblem(doc: ImageDocument, index: number): string | null {
  if (index === 0) return "The original cannot be deleted.";
  for (let k = index + 1; k < doc.steps.length; k++) {
    const step = doc.steps[k];
    const before = doc.steps[k - 1];
    if (!step || !before) continue;
    const redo = redoKind(step, before);
    if (redo.kind === "blocked") return `Step ${k}, ${step.label}, comes later. ${redo.reason}`;
  }
  return null;
}

const fitted = (selection: Mask | null, width: number, height: number) =>
  selection && (selection.width !== width || selection.height !== height)
    ? scaleSelection(selection, width, height)
    : selection;

export async function deleteHistoryStep(documentId: string, index: number): Promise<void> {
  const doc = useDocuments.getState().documents.find((d) => d.id === documentId);
  const removed = doc?.steps[index];
  if (!doc || !removed) return;
  const problem = deleteProblem(doc, index);
  if (problem) {
    notify("info", `Step ${index} cannot be deleted`, problem);
    return;
  }
  const { beginWork, endWork } = useUi.getState();
  const later = doc.steps.length - index - 1;
  beginWork(later ? `Recomputing ${later} later steps` : "Deleting the step");
  try {
    const kept = doc.steps.slice(0, index);
    let previous = kept[kept.length - 1] as HistoryStep;
    const steps: HistoryStep[] = [...kept];
    for (const step of doc.steps.slice(index + 1)) {
      let next: HistoryStep;
      if (step.filter) {
        const image = await replayFilter(
          {
            filterId: step.filter.id,
            params: step.filter.params,
            scope: step.filter.scope ?? "whole",
          },
          previous.image,
          previous.selection,
        );
        next = {
          ...step,
          image,
          selection: fitted(previous.selection, image.width, image.height),
        };
      } else {
        const { width, height } = previous.image;
        next = { ...step, image: previous.image, selection: fitted(step.selection, width, height) };
      }
      steps.push(next);
      previous = next;
    }
    const now = useDocuments.getState().documents.find((d) => d.id === documentId);
    if (now?.steps !== doc.steps) {
      notify(
        "warning",
        "The history changed while the steps were recomputed",
        "Nothing was deleted.",
      );
      return;
    }
    const current = doc.index >= index ? Math.max(0, doc.index - 1) : doc.index;
    useDocuments.getState().replaceHistory(documentId, steps, current);
    const message = later
      ? `Deleted step ${index}, ${removed.label}, and recomputed ${later} later ${later === 1 ? "step" : "steps"}.`
      : `Deleted step ${index}, ${removed.label}.`;
    announce(message);
    notify("success", `Deleted ${removed.label}`, message);
  } catch (error) {
    notify(
      "error",
      "The step was not deleted",
      `A later step could not be recomputed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    endWork();
  }
}

/**
 * The Reset button of Properties. The filter's values go back to their defaults. When the latest
 * steps of the active image come from this filter, the image also goes back to the step before
 * them. That is an undo, so Redo brings the steps back.
 */
export function resetFilter(filterId: string): void {
  useFilters.getState().resetValues(filterId);
  const state = useDocuments.getState();
  const doc = state.documents.find((d) => d.id === state.activeId);
  let index = doc?.index ?? 0;
  while (index > 0 && doc?.steps[index]?.filter?.id === filterId) index--;
  if (!doc || index === doc.index) {
    announce("Reset the values to their defaults.");
    return;
  }
  const undone = doc.index - index;
  state.jumpTo(doc.id, index);
  announce(
    `Reset the values and undid ${undone} ${undone === 1 ? "step" : "steps"} of ${filterById(filterId)?.name ?? "this filter"}.`,
  );
}
