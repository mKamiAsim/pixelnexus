/**
 * AI image tasks on top of the AI router (PLAN.md Phase 7f): Image > AI denoising, AI JPEG
 * cleanup and AI super-resolution. Each runs the task of catalog/ai-tasks.yaml with the provider you chose for
 * it. With no provider, or when the provider fails, the message names the classical filter and
 * the image stays as it was.
 *
 * With a selection, a task that allows a crop sends only the box around the selection, and the
 * answer is blended back with the selection as its weight, so soft edges stay soft. Enlarging
 * always sends the whole image, since it changes the size.
 */
import { catalog } from "@/catalog";
import { cropImage, maskBounds } from "@/core/ai/crop";
import type { AiRequest, AiTask, Box } from "@/core/ai/types";
import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";
import { activeDocument, useDocuments, type ImageDocument } from "@/state/documents";
import { announce, notify } from "@/state/notifications";
import { useUi } from "@/state/ui";

import { runAiTask } from "./aiActions";

export type AiImageTask = "denoise" | "jpeg-cleanup" | "super-resolution";

const task = (id: string): AiTask => {
  const found = catalog.aiTasks.find((t) => t.id === id);
  if (!found) throw new Error(`The AI task ${id} is not in the catalog.`);
  return found;
};

/** The request of an image task: the box around the selection when the task allows a crop. */
export function aiImageRequest(taskId: AiImageTask, doc: ImageDocument): AiRequest {
  const t = task(taskId);
  const { width, height } = doc.current;
  const box = t.crop && t.output === "image" && doc.selection ? maskBounds(doc.selection) : null;
  if (!box || taskId === "super-resolution") {
    return { task: t, image: doc.current, full: { width, height } };
  }
  return {
    task: t,
    image: cropImage(doc.current, box),
    origin: { x: box.x, y: box.y },
    full: { width, height },
  };
}

/** Blend a crop's answer into the image, weighted by the selection. */
export function blendBack(image: RgbaImage, part: RgbaImage, at: Box, mask: Mask): RgbaImage {
  const data = new Uint8ClampedArray(image.data);
  for (let y = 0; y < at.height; y++) {
    for (let x = 0; x < at.width; x++) {
      const p = (at.y + y) * image.width + at.x + x;
      const w = (mask.data[p] ?? 0) / 255;
      if (w === 0) continue;
      for (let c = 0; c < 4; c++) {
        const o = p * 4 + c;
        const v = part.data[(y * part.width + x) * 4 + c] ?? 0;
        data[o] = Math.round((image.data[o] ?? 0) * (1 - w) + v * w);
      }
    }
  }
  return { width: image.width, height: image.height, data };
}

export async function aiImage(taskId: AiImageTask): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const request = aiImageRequest(taskId, doc);
  const label = `${request.task.name} with AI`;
  const { beginWork, endWork } = useUi.getState();
  beginWork(`${label} is running`);
  announce(`${label} is running.`);
  try {
    const outcome = await runAiTask(request);
    if (outcome.status !== "done" || outcome.result.kind !== "image") return;
    const now = activeDocument();
    if (now?.id !== doc.id || now.current !== doc.current) return;
    const answer = outcome.result.image;
    let image = answer;
    if (request.origin && doc.selection) {
      const at = { ...request.origin, width: request.image.width, height: request.image.height };
      if (answer.width !== at.width || answer.height !== at.height) {
        throw new Error("The provider answered with another size than the area it was sent.");
      }
      image = blendBack(doc.current, answer, at, doc.selection);
    }
    useDocuments
      .getState()
      .edit(doc.id, image, `${label} (${outcome.provider.name})`, undefined, undefined, true);
    announce(`${label} applied. The image is ${image.width} by ${image.height} pixels.`);
    notify("info", label, outcome.result.label);
  } catch (error) {
    notify("error", `${label} did not run`, error instanceof Error ? error.message : String(error));
  } finally {
    endWork();
  }
}
