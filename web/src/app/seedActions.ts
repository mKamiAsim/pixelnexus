/**
 * Classical selections from the engine: Select > Object sends the box around the selection to
 * GrabCut, and the Click Select tool sends its seeds to the random walker. Both run the
 * catalog's segmentation filters on the whole image, and the object replaces the selection.
 *
 * Catalog entries: catalog/tools/object-select-classical.yaml and click-select-classical.yaml.
 */
import { catalog } from "@/catalog";
import { labelMask } from "@/core/features/labels";
import { fullRect } from "@/core/filters/run";
import { isMaskEmpty, type Mask } from "@/core/mask/mask";
import { seedMap, type Seed } from "@/core/selection/seeds";
import { runJob } from "@/engine-client";
import { toolValues } from "@/selection/values";
import { activeDocument, type ImageDocument } from "@/state/documents";
import { announce, notify } from "@/state/notifications";
import { useSeeds } from "@/state/seeds";
import { useUi } from "@/state/ui";

import { runAiTask } from "./aiActions";
import { commitSelection } from "./selectionActions";

/** Run a segmentation filter with the selection or seed map, and return its object. */
async function objectFrom(
  doc: ImageDocument,
  filterId: string,
  values: Readonly<Record<string, unknown>>,
  input: Mask,
): Promise<Mask | null> {
  const result = await runJob({
    filterId,
    values: { ...values, output: "regions" },
    image: doc.current,
    region: fullRect(doc.current),
    hole: input,
  });
  const now = activeDocument();
  if (now?.id !== doc.id || now.current !== doc.current) return null;
  if (!result.labels) throw new Error("The engine did not send regions.");
  return labelMask(result.labels, new Set([1]));
}

async function engineSelection(
  label: string,
  busy: string,
  make: (doc: ImageDocument) => Promise<Mask | null>,
): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const { beginWork, endWork } = useUi.getState();
  beginWork(busy);
  announce(`${busy}.`);
  try {
    const mask = await make(doc);
    if (mask) commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, label);
  } catch (error) {
    notify(
      "error",
      `${label} failed`,
      error instanceof Error ? error.message : "The selection could not be made.",
    );
  } finally {
    endWork();
  }
}

/** Select > Object: GrabCut from the rectangle around the selection. */
export function selectObject(): Promise<void> {
  return engineSelection("Select object", "Finding the object in the box", async (doc) => {
    if (!doc.selection) {
      notify("info", "Draw a box first", "Select a rectangle around the object, then try again.");
      return null;
    }
    return objectFrom(doc, "grabcut", { start: "box" }, doc.selection);
  });
}

/** The latest Click Select run. Older runs that finish later are dropped. */
let latest = 0;

/** Click Select: add a seed and let the random walker select from all seeds of this image. */
export function addSeed(x: number, y: number, object: boolean): Promise<void> {
  const doc = activeDocument();
  if (!doc) return Promise.resolve();
  const seeds = useSeeds.getState().add(doc.id, doc.current, { x, y, object });
  const run = ++latest;
  return engineSelection("Click Select", "Selecting from your clicks", async () => {
    const values = toolValues("click-select-classical");
    const map = seedMap(doc.current.width, doc.current.height, seeds, Number(values.seedRadius));
    const mask = await objectFrom(doc, "random-walker", { seeds: "map", beta: values.beta }, map);
    return run === latest ? mask : null;
  });
}

/**
 * AI Click Select: add a click and send all clicks of this image to the provider of the
 * click-select task, as positive and negative points. The answer replaces the selection. With
 * no provider, the selection stays and the message names the classical Click Select.
 */
export function addAiSeed(x: number, y: number, object: boolean): Promise<void> {
  const doc = activeDocument();
  if (!doc) return Promise.resolve();
  const task = catalog.aiTasks.find((t) => t.id === "click-select");
  if (!task) return Promise.resolve();
  const seeds = useSeeds.getState().add(doc.id, doc.current, { x, y, object });
  const run = ++latest;
  return engineSelection("AI Click Select", "Selecting from your clicks with AI", async () => {
    const outcome = await runAiTask({
      task,
      image: doc.current,
      points: seeds.map((s) => ({ x: s.x, y: s.y, positive: s.object })),
      full: { width: doc.current.width, height: doc.current.height },
    });
    if (outcome.status !== "done" || outcome.result.kind !== "mask" || run !== latest) return null;
    const now = activeDocument();
    if (now?.id !== doc.id || now.current !== doc.current) return null;
    notify("info", "AI Click Select", outcome.result.label);
    return outcome.result.mask;
  });
}

/** Forget the Click Select seeds. The selection stays. */
export function clearSeeds(): void {
  useSeeds.getState().clear();
  announce("Cleared the Click Select seeds.");
}

/** The seeds to draw for a document, or none when they belong to another image. */
export function seedsFor(doc: ImageDocument | null): readonly Seed[] {
  const state = useSeeds.getState();
  return doc && state.documentId === doc.id && state.image === doc.current ? state.seeds : [];
}
