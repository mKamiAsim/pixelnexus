/**
 * Warn once about each new history step that changed the image's size, transparency or color
 * (PLAN.md Phase 8). The notes are worked out by the documents store when the step is made, and
 * stay on the step, where the History panel's details show them.
 */
import { useDocuments } from "@/state/documents";
import { notify } from "@/state/notifications";

export function watchChangeWarnings(): () => void {
  return useDocuments.subscribe((state, previous) => {
    const known = new Set(previous.documents.flatMap((d) => d.steps.map((s) => s.id)));
    for (const doc of state.documents) {
      for (const step of doc.steps) {
        if (!known.has(step.id) && step.notes?.length) {
          notify("warning", `${step.label} changed the image`, step.notes.join(" "));
        }
      }
    }
  });
}
