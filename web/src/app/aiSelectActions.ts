/**
 * AI selections on top of the AI router: Select > AI subject, AI background,
 * AI object and AI soft edges. Each runs the task of catalog/ai-tasks.yaml with the provider you chose for it.
 * With no provider, or when the provider fails, the message names the classical tool, and the
 * selection stays as it was. The router never falls back on its own.
 *
 * A task that allows a crop (object-select) sends only the box around the selection plus a
 * margin. The margin, a quarter of the box's longer side and at least 16 pixels, is our choice.
 */
import { catalog } from "@/catalog";
import { cropImage, maskBounds, withMargin } from "@/core/ai/crop";
import type { AiRequest, AiTask, Box } from "@/core/ai/types";
import { createMask, invertMask, isMaskEmpty, type Mask } from "@/core/mask/mask";
import { activeDocument, type ImageDocument } from "@/state/documents";
import { announce, notify } from "@/state/notifications";
import { useUi } from "@/state/ui";

import { runAiTask } from "./aiActions";
import { commitSelection } from "./selectionActions";

const task = (id: string): AiTask => {
  const found = catalog.aiTasks.find((t) => t.id === id);
  if (!found) throw new Error(`The AI task ${id} is not in the catalog.`);
  return found;
};

/** A crop's mask placed into an empty mask of the full size. */
export function placeMask(part: Mask, at: { x: number; y: number }, width: number, height: number) {
  const mask = createMask(width, height);
  for (let y = 0; y < part.height; y++) {
    mask.data.set(
      part.data.subarray(y * part.width, (y + 1) * part.width),
      (at.y + y) * width + at.x,
    );
  }
  return mask;
}

/** The area sent for a box prompt: the box plus the margin, inside the image. */
export function cropFor(box: Box, width: number, height: number): Box {
  const margin = Math.max(16, Math.round(Math.max(box.width, box.height) / 4));
  return withMargin(box, margin, width, height);
}

/** Build the request of a task for a document. Null, with a message, when it cannot run. */
export function aiRequest(taskId: string, doc: ImageDocument): AiRequest | null {
  const t = task(taskId);
  if (taskId !== "object-select") return { task: t, image: doc.current };
  const box = doc.selection ? maskBounds(doc.selection) : null;
  if (!box) {
    notify("info", "Draw a box first", "Select a rectangle around the object, then try again.");
    return null;
  }
  const { width, height } = doc.current;
  const area = t.crop ? cropFor(box, width, height) : { x: 0, y: 0, width, height };
  return {
    task: t,
    image: cropImage(doc.current, area),
    box: { x: box.x - area.x, y: box.y - area.y, width: box.width, height: box.height },
    origin: { x: area.x, y: area.y },
    full: { width, height },
  };
}

/** Run a mask task for the active document and make its answer the selection. */
export async function aiSelect(
  taskId: "subject-select" | "object-select" | "matting",
  background = false,
): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const request = aiRequest(taskId, doc);
  if (!request) return;
  const label = background ? "AI background" : `AI ${request.task.name.toLowerCase()}`;
  const { beginWork, endWork } = useUi.getState();
  beginWork(`${label} is running`);
  announce(`${label} is running.`);
  try {
    const outcome = await runAiTask(request);
    if (outcome.status !== "done" || outcome.result.kind !== "mask") return;
    const now = activeDocument();
    if (now?.id !== doc.id || now.current !== doc.current) return;
    const { width, height } = doc.current;
    const part = outcome.result.mask;
    const whole = request.origin ? placeMask(part, request.origin, width, height) : part;
    const mask = background ? invertMask(whole) : whole;
    commitSelection(
      doc.id,
      isMaskEmpty(mask) ? null : mask,
      `${label} (${outcome.provider.name})`,
      true,
    );
    notify("info", label, outcome.result.label);
  } finally {
    endWork();
  }
}
