/**
 * Which history steps are AI results (PLAN.md section 3.11). A step is one when an AI task made
 * it, or when it ran a filter that needs a learned model in the catalog (model or modelChoices). The label stays on
 * the image while any step up to the current one is an AI result.
 */
import { catalog } from "@/catalog";
import { AI_RESULT_LABEL } from "@/core/ai/types";
import type { HistoryStep, ImageDocument } from "@/state/documents";

export { AI_RESULT_LABEL };

const MODEL_FILTERS: ReadonlySet<string> = new Set(
  catalog.filters
    .filter((f) => f.model !== undefined || f.modelChoices !== undefined)
    .map((f) => f.id),
);

export function isAiStep(step: HistoryStep): boolean {
  return step.ai === true || (step.filter !== undefined && MODEL_FILTERS.has(step.filter.id));
}

/** True when the current image holds an AI result. */
export function hasAiResult(doc: Pick<ImageDocument, "steps" | "index">): boolean {
  return doc.steps.slice(0, doc.index + 1).some(isAiStep);
}
