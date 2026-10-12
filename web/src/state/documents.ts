/**
 * Open images and their history.
 *
 * Each document keeps a list of steps. Step 0 is the image as it was opened and is never
 * dropped. Each edit adds a step after the current position and removes any steps that were
 * undone. Undo and redo move the position, and the History panel can jump to any step.
 *
 * Each step also holds the selection, so undo and redo cover selection changes as they do in
 * Photoshop. A selection step keeps the image of the step before it, so it costs only its mask.
 *
 * Steps hold whole images, so the history has a memory budget. When it is full, the oldest
 * steps after the original are dropped. Compressed snapshots arrive with the full history in
 * Phase 8.
 */
import { create } from "zustand";

import type { ViewState } from "@/canvas/viewport";
import type { DecodePath } from "@/core/image/decode";
import type { ImageHeader } from "@/core/image/format";
import type { LoadIssue } from "@/core/image/limits";
import type { RgbaImage } from "@/core/image/types";
import type { ParamValue } from "@/core/filters/types";
import { masksEqual, type Mask } from "@/core/mask/mask";

export type DocumentSource = "file" | "paste" | "sample";

/** The most steps a document keeps, the original included. */
export const MAX_STEPS = 51;
/** The most bytes of image and mask data a document's history keeps. */
export const HISTORY_BYTES = 768 * 1024 * 1024;

/** The limits in use. Tests lower them to stay small. */
export const historyLimits = { steps: MAX_STEPS, bytes: HISTORY_BYTES };

export interface HistoryStep {
  readonly id: number;
  readonly label: string;
  readonly image: RgbaImage;
  /** The selection at this step, or null for none. */
  readonly selection: Mask | null;
  /** For filter steps: the filter and the validated parameters it ran with. */
  readonly filter?: FilterRecord;
  /** Milliseconds since 1970, when the step was made. */
  readonly at: number;
}

export interface ImageDocument {
  readonly id: string;
  readonly name: string;
  readonly source: DocumentSource;
  /** File size in bytes. Zero for built-in samples. */
  readonly fileBytes: number;
  /** Header facts. Null for built-in samples, which have no file. */
  readonly header: ImageHeader | null;
  readonly warnings: readonly LoadIssue[];
  readonly decodePath?: DecodePath;
  readonly original: RgbaImage;
  /** The image at the current step. */
  readonly current: RgbaImage;
  /** The selection at the current step. */
  readonly selection: Mask | null;
  /** False while the selection is turned off for a while. It is kept, but filters ignore it. */
  readonly selectionEnabled: boolean;
  /** Saved selections, by name. They are not part of the history. */
  readonly masks: readonly NamedMask[];
  readonly steps: readonly HistoryStep[];
  /** Position of the current step in `steps`. */
  readonly index: number;
  /** How many old steps were dropped to stay within the budget. */
  readonly dropped: number;
  /** Null until the viewport has measured itself and fitted the image. */
  readonly view: ViewState | null;
}

export interface NamedMask {
  readonly id: number;
  readonly name: string;
  readonly mask: Mask;
}

export type NewDocument = Omit<
  ImageDocument,
  | "id"
  | "current"
  | "steps"
  | "index"
  | "dropped"
  | "view"
  | "selection"
  | "selectionEnabled"
  | "masks"
>;

export interface FilterRecord {
  readonly id: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  /** Set when the filter worked only inside the selection, or only outside it. */
  readonly scope?: "selection" | "inverse";
}

interface DocumentsState {
  documents: readonly ImageDocument[];
  activeId: string | null;
  open: (document: NewDocument) => string;
  close: (id: string) => void;
  activate: (id: string) => void;
  setView: (id: string, view: ViewState) => void;
  /**
   * Add a step with new pixels. A size change resets the view so the image fits again. The
   * selection stays, unless `selection` gives a new one. A size change without a new selection
   * drops it.
   */
  edit: (
    id: string,
    image: RgbaImage,
    label: string,
    filter?: FilterRecord,
    selection?: Mask | null,
  ) => void;
  /** Add a step that changes only the selection. Null deselects. Nothing happens if it is the same. */
  select: (id: string, selection: Mask | null, label: string) => void;
  setSelectionEnabled: (id: string, enabled: boolean) => void;
  saveMask: (id: string, name: string, mask: Mask) => void;
  deleteMask: (id: string, maskId: number) => void;
  revert: (id: string) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  /** Go to any step in the history. */
  jumpTo: (id: string, index: number) => void;
}

let counter = 0;
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${++counter}`;
let stepCounter = 0;
let maskCounter = 0;

const sameSize = (a: RgbaImage, b: RgbaImage) => a.width === b.width && a.height === b.height;

/** Bytes held by the steps. An image or mask used by several steps counts once. */
export function historyBytes(steps: readonly HistoryStep[]): number {
  let bytes = 0;
  for (const image of new Set(steps.map((s) => s.image))) bytes += image.data.byteLength;
  for (const mask of new Set(steps.map((s) => s.selection))) bytes += mask?.data.byteLength ?? 0;
  return bytes;
}

/** The selection that filters use: null when there is none or it is turned off. */
export const activeSelection = (doc: ImageDocument | null): Mask | null =>
  doc?.selectionEnabled ? doc.selection : null;

export const canUndo = (doc: ImageDocument | null) => doc !== null && doc.index > 0;
export const canRedo = (doc: ImageDocument | null) =>
  doc !== null && doc.index < doc.steps.length - 1;
/** The steps that made the current image, oldest first, without the original. */
export const appliedSteps = (doc: ImageDocument) => doc.steps.slice(1, doc.index + 1);

/** Move to a step. The view is kept when the size stays the same. */
function moveTo(doc: ImageDocument, index: number): ImageDocument {
  const step = doc.steps[index];
  if (!step || index === doc.index) return doc;
  return {
    ...doc,
    index,
    current: step.image,
    selection: step.selection,
    view: sameSize(step.image, doc.current) ? doc.view : null,
  };
}

/** Drop the oldest steps after the original until the history fits its limits. */
function trim(doc: ImageDocument): ImageDocument {
  let { steps, index, dropped } = doc;
  while (
    steps.length > 2 &&
    index > 1 &&
    (steps.length > historyLimits.steps || historyBytes(steps) > historyLimits.bytes)
  ) {
    steps = [steps[0] as HistoryStep, ...steps.slice(2)];
    index--;
    dropped++;
  }
  return { ...doc, steps, index, dropped };
}

const update = (
  documents: readonly ImageDocument[],
  id: string,
  change: (d: ImageDocument) => ImageDocument,
) => documents.map((d) => (d.id === id ? change(d) : d));

function addStep(
  doc: ImageDocument,
  image: RgbaImage,
  label: string,
  filter?: FilterRecord,
  selection?: Mask | null,
) {
  const kept = sameSize(image, doc.current) ? doc.selection : null;
  const next = selection === undefined ? kept : selection;
  const step: HistoryStep = {
    id: ++stepCounter,
    label,
    image,
    selection: next,
    at: Date.now(),
    ...(filter ? { filter } : {}),
  };
  const steps = [...doc.steps.slice(0, doc.index + 1), step];
  return trim({
    ...doc,
    steps,
    index: steps.length - 1,
    current: image,
    selection: next,
    selectionEnabled: next !== doc.selection ? true : doc.selectionEnabled,
    view: sameSize(image, doc.current) ? doc.view : null,
  });
}

export const useDocuments = create<DocumentsState>()((set) => ({
  documents: [],
  activeId: null,
  open: (document) => {
    const id = newId();
    const first: HistoryStep = {
      id: ++stepCounter,
      label: "Open",
      image: document.original,
      selection: null,
      at: Date.now(),
    };
    set((state) => ({
      documents: [
        ...state.documents,
        {
          ...document,
          id,
          current: document.original,
          selection: null,
          selectionEnabled: true,
          masks: [],
          steps: [first],
          index: 0,
          dropped: 0,
          view: null,
        },
      ],
      activeId: id,
    }));
    return id;
  },
  close: (id) =>
    set((state) => {
      const index = state.documents.findIndex((d) => d.id === id);
      const documents = state.documents.filter((d) => d.id !== id);
      const neighbor = documents[Math.min(index, documents.length - 1)];
      return {
        documents,
        activeId: state.activeId === id ? (neighbor?.id ?? null) : state.activeId,
      };
    }),
  activate: (id) => set({ activeId: id }),
  setView: (id, view) =>
    set((state) => ({ documents: update(state.documents, id, (d) => ({ ...d, view })) })),
  edit: (id, image, label, filter, selection) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => addStep(d, image, label, filter, selection)),
    })),
  select: (id, selection, label) =>
    set((state) => ({
      documents: update(state.documents, id, (d) =>
        masksEqual(selection, d.selection)
          ? { ...d, selectionEnabled: true }
          : addStep(d, d.current, label, undefined, selection),
      ),
    })),
  setSelectionEnabled: (id, enabled) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => ({ ...d, selectionEnabled: enabled })),
    })),
  saveMask: (id, name, mask) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => ({
        ...d,
        masks: [...d.masks, { id: ++maskCounter, name, mask }],
      })),
    })),
  deleteMask: (id, maskId) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => ({
        ...d,
        masks: d.masks.filter((m) => m.id !== maskId),
      })),
    })),
  revert: (id) =>
    set((state) => ({
      documents: update(state.documents, id, (d) =>
        d.current === d.original ? d : addStep(d, d.original, "Revert to original"),
      ),
    })),
  undo: (id) =>
    set((state) => ({ documents: update(state.documents, id, (d) => moveTo(d, d.index - 1)) })),
  redo: (id) =>
    set((state) => ({ documents: update(state.documents, id, (d) => moveTo(d, d.index + 1)) })),
  jumpTo: (id, index) =>
    set((state) => ({ documents: update(state.documents, id, (d) => moveTo(d, index)) })),
}));

export function activeDocument(
  state: DocumentsState = useDocuments.getState(),
): ImageDocument | null {
  return state.documents.find((d) => d.id === state.activeId) ?? null;
}
