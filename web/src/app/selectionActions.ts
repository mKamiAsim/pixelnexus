/**
 * Selection commands: select all, deselect, reselect, inverse, refine, masks from the image,
 * named masks, and mask files. Every change goes through `commitSelection`, which adds a history
 * step and says what happened, for the eyes and for screen readers.
 */
import { encodeImage } from "@/core/image/encode";
import type { RgbaImage } from "@/core/image/types";
import {
  combineMasks,
  invertMask,
  isMaskEmpty,
  maskFromAlpha,
  maskFromLuminance,
  maskStats,
  maskToImage,
  selectAll as allMask,
  type CombineMode,
  type Mask,
} from "@/core/mask/mask";
import { borderMask, featherMask, growMask, shrinkMask, smoothMask } from "@/core/mask/refine";
import { snapToEdges } from "@/core/selection/snap";
import { decodeInWorker } from "@/core/workers/decode-client";
import { subjectInWorker } from "@/core/workers/subject-client";
import { activeDocument, useDocuments, type ImageDocument } from "@/state/documents";
import { announce, notify } from "@/state/notifications";
import { useSelection, type RefineKind } from "@/state/selection";
import { useSettings } from "@/state/settings";
import { useUi } from "@/state/ui";

import { download } from "./download";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** One sentence about a selection, for the status bar and screen readers. */
export function describeSelection(mask: Mask | null): string {
  if (!mask) return "No selection";
  const stats = maskStats(mask);
  if (!stats.bounds) return "No selection";
  const { x, y, width, height } = stats.bounds;
  const all =
    width === mask.width && height === mask.height && stats.area === mask.width * mask.height;
  const where = all ? "the whole image" : `${width} x ${height} px at x ${x}, y ${y}`;
  return `Selection: ${where}, ${fmt(stats.area)} px${stats.soft ? ", soft edge" : ""}`;
}

/** Add a selection step to a document. Deselecting keeps the old selection for Reselect. */
export function commitSelection(
  documentId: string,
  mask: Mask | null,
  label: string,
  ai = false,
): void {
  const doc = useDocuments.getState().documents.find((d) => d.id === documentId);
  if (!doc) return;
  if (!mask && doc.selection) useSelection.getState().remember(documentId, doc.selection);
  useDocuments.getState().select(documentId, mask, label, ai);
  announce(`${label}. ${describeSelection(mask)}.`);
}

const withDocument = (run: (doc: ImageDocument) => void) => () => {
  const doc = activeDocument();
  if (doc) run(doc);
};

export const hasSelection = () => Boolean(activeDocument()?.selection);

export const selectAll = withDocument((doc) =>
  commitSelection(doc.id, allMask(doc.current.width, doc.current.height), "Select all"),
);

export const deselect = withDocument((doc) => {
  if (doc.selection) commitSelection(doc.id, null, "Deselect");
});

export const canReselect = () => {
  const doc = activeDocument();
  const previous = doc ? useSelection.getState().previous[doc.id] : undefined;
  return Boolean(
    doc &&
    previous &&
    previous.width === doc.current.width &&
    previous.height === doc.current.height,
  );
};

export const reselect = withDocument((doc) => {
  const previous = useSelection.getState().previous[doc.id];
  if (previous && canReselect()) commitSelection(doc.id, previous, "Reselect");
});

export const inverse = withDocument((doc) => {
  if (!doc.selection) return;
  const mask = invertMask(doc.selection);
  commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, "Inverse");
});

export const toggleSelectionEnabled = withDocument((doc) => {
  if (!doc.selection) return;
  const enabled = !doc.selectionEnabled;
  useDocuments.getState().setSelectionEnabled(doc.id, enabled);
  announce(
    enabled
      ? "The selection is on again. Filters work inside it."
      : "The selection is off for now. Filters work on the whole image.",
  );
});

/** Make a selection from the image and combine it with the current one. */
function fromImage(label: string, make: (image: RgbaImage) => Mask, mode: CombineMode = "new") {
  return withDocument((doc) => {
    const mask = combineMasks(doc.selection, make(doc.current), mode);
    commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, label);
  });
}

export const selectFromAlpha = fromImage("Selection from alpha", maskFromAlpha);
export const selectFromLuminance = fromImage("Selection from luminance", maskFromLuminance);

export type { RefineKind } from "@/state/selection";

export interface RefineSpec {
  readonly kind: RefineKind;
  readonly title: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly fallback: number;
  readonly help: string;
}

/** The refine operations, with their amount in pixels. */
export const REFINE: Readonly<Record<RefineKind, RefineSpec>> = {
  grow: {
    kind: "grow",
    title: "Grow selection",
    label: "Grow by",
    min: 1,
    max: 500,
    step: 1,
    fallback: 4,
    help: "Adds every pixel within this distance of the selection. The result has a hard edge.",
  },
  shrink: {
    kind: "shrink",
    title: "Shrink selection",
    label: "Shrink by",
    min: 1,
    max: 500,
    step: 1,
    fallback: 4,
    help: "Keeps the pixels that are farther than this from any unselected pixel. The result has a hard edge.",
  },
  feather: {
    kind: "feather",
    title: "Feather selection",
    label: "Feather radius",
    min: 0.5,
    max: 250,
    step: 0.5,
    fallback: 4,
    help: "Softens the edge. About 95% of the change happens within this distance on each side.",
  },
  smooth: {
    kind: "smooth",
    title: "Smooth selection",
    label: "Sample radius",
    min: 1,
    max: 100,
    step: 1,
    fallback: 2,
    help: "Each pixel takes the majority of its square neighborhood. Specks go and corners round. The result has a hard edge.",
  },
  border: {
    kind: "border",
    title: "Border selection",
    label: "Border width",
    min: 1,
    max: 200,
    step: 1,
    fallback: 8,
    help: "Selects a band along the edge, half inside and half outside. The result has a hard edge.",
  },
};

export function refineMask(mask: Mask, kind: RefineKind, amount: number, edges = false): Mask {
  switch (kind) {
    case "grow":
      return growMask(mask, amount);
    case "shrink":
      return shrinkMask(mask, amount, edges);
    case "feather":
      return featherMask(mask, amount);
    case "smooth":
      return smoothMask(mask, Math.round(amount));
    case "border":
      return borderMask(mask, Math.round(amount));
  }
}

export function refineSelection(kind: RefineKind, amount: number, edges = false): void {
  const doc = activeDocument();
  if (!doc?.selection) return;
  const mask = refineMask(doc.selection, kind, amount, edges);
  const label = `${REFINE[kind].title.replace(" selection", "")} ${amount} px`;
  commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, label);
}

/** Select > Modify > Snap to edges: move the selection edge onto nearby image edges. */
export function snapSelection(values: {
  radius: number;
  contrast: number;
  smoothing: number;
}): void {
  const doc = activeDocument();
  if (!doc?.selection) return;
  const mask = snapToEdges(doc.current, doc.selection, {
    radius: values.radius,
    contrast: values.contrast / 100,
    smoothing: values.smoothing,
  });
  commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, "Snap to edges");
}

/**
 * Select > Subject and Select > Background: the classical subject heuristic in a worker. The
 * result replaces the selection.
 */
export async function selectSubject(background: boolean): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const label = background ? "Select background" : "Select subject";
  const { beginWork, endWork } = useUi.getState();
  beginWork(background ? "Finding the background" : "Finding the subject");
  announce(background ? "Finding the background." : "Finding the subject.");
  try {
    const subject = await subjectInWorker(doc.current);
    const now = activeDocument();
    if (now?.id !== doc.id || now.current !== doc.current) return;
    const mask = background ? invertMask(subject) : subject;
    commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, label);
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

export function saveSelection(name: string): void {
  const doc = activeDocument();
  if (!doc?.selection) return;
  const clean = name.trim() || `Mask ${doc.masks.length + 1}`;
  useDocuments.getState().saveMask(doc.id, clean, doc.selection);
  notify("success", `Saved the selection as "${clean}"`);
}

export function loadSelection(maskId: number, mode: CombineMode): void {
  const doc = activeDocument();
  const saved = doc?.masks.find((m) => m.id === maskId);
  if (!doc || !saved) return;
  if (saved.mask.width !== doc.current.width || saved.mask.height !== doc.current.height) {
    notify(
      "error",
      `"${saved.name}" does not fit this image`,
      `The mask is ${saved.mask.width} x ${saved.mask.height} pixels. The image is ${doc.current.width} x ${doc.current.height}.`,
    );
    return;
  }
  const mask = combineMasks(doc.selection, saved.mask, mode);
  commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, `Load "${saved.name}"`);
}

/** Save the selection as a gray PNG: white is selected, black is not. */
export async function exportMask(): Promise<void> {
  const doc = activeDocument();
  if (!doc?.selection) return;
  const blob = await encodeImage(maskToImage(doc.selection), { format: "png" });
  const base = doc.name.replace(/\.[^.]+$/, "");
  download(blob, `${base}_mask.png`);
  notify("success", "Saved the mask as a PNG file");
}

/** Read a mask from an image file: brightness becomes the selection. */
export async function importMask(file: File, mode: CombineMode = "new"): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  try {
    const decoded = await decodeInWorker(await file.arrayBuffer(), useSettings.getState().limits);
    const { width, height } = decoded.image;
    if (width !== doc.current.width || height !== doc.current.height) {
      notify(
        "error",
        `${file.name} does not fit this image`,
        `The file is ${width} x ${height} pixels. The image is ${doc.current.width} x ${doc.current.height}.`,
      );
      return;
    }
    const mask = combineMasks(doc.selection, maskFromLuminance(decoded.image), mode);
    commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, `Mask from ${file.name}`);
  } catch (error) {
    notify(
      "error",
      `Could not read ${file.name}`,
      error instanceof Error ? error.message : "The file could not be opened.",
    );
  }
}
