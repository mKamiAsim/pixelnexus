/**
 * Open images. Each document keeps the original pixels untouched and a current version that
 * edits replace. Phase 2 keeps a simple in-memory undo stack of whole images, limited to
 * MAX_UNDO steps. Phase 3 replaces it with the full history (compressed snapshots, timeline).
 */
import { create } from "zustand";

import type { ViewState } from "@/canvas/viewport";
import type { DecodePath } from "@/core/image/decode";
import type { ImageHeader } from "@/core/image/format";
import type { LoadIssue } from "@/core/image/limits";
import type { RgbaImage } from "@/core/image/types";

export type DocumentSource = "file" | "paste" | "sample";

export const MAX_UNDO = 20;

export interface EditStep {
  readonly image: RgbaImage;
  readonly label: string;
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
  readonly current: RgbaImage;
  /** Short labels of the edits applied since opening, oldest first. */
  readonly edits: readonly string[];
  /** Earlier versions, newest last. */
  readonly undoStack: readonly EditStep[];
  /** Versions removed by undo, newest last. */
  readonly redoStack: readonly EditStep[];
  /** Null until the viewport has measured itself and fitted the image. */
  readonly view: ViewState | null;
}

export type NewDocument = Omit<
  ImageDocument,
  "id" | "current" | "edits" | "view" | "undoStack" | "redoStack"
>;

interface DocumentsState {
  documents: readonly ImageDocument[];
  activeId: string | null;
  open: (document: NewDocument) => string;
  close: (id: string) => void;
  activate: (id: string) => void;
  setView: (id: string, view: ViewState) => void;
  /** Replace the current pixels. A size change resets the view so the image fits again. */
  edit: (id: string, image: RgbaImage, label: string) => void;
  revert: (id: string) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
}

let counter = 0;
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${++counter}`;

const sameSize = (a: RgbaImage, b: RgbaImage) => a.width === b.width && a.height === b.height;

const update = (
  documents: readonly ImageDocument[],
  id: string,
  change: (d: ImageDocument) => ImageDocument,
) => documents.map((d) => (d.id === id ? change(d) : d));

export const useDocuments = create<DocumentsState>()((set) => ({
  documents: [],
  activeId: null,
  open: (document) => {
    const id = newId();
    set((state) => ({
      documents: [
        ...state.documents,
        {
          ...document,
          id,
          current: document.original,
          edits: [],
          view: null,
          undoStack: [],
          redoStack: [],
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
  edit: (id, image, label) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => ({
        ...d,
        current: image,
        edits: [...d.edits, label],
        view: sameSize(image, d.current) ? d.view : null,
        undoStack: [...d.undoStack, { image: d.current, label }].slice(-MAX_UNDO),
        redoStack: [],
      })),
    })),
  revert: (id) =>
    set((state) => ({
      documents: update(state.documents, id, (d) =>
        d.current === d.original
          ? d
          : {
              ...d,
              current: d.original,
              edits: [...d.edits, "Revert to original"],
              view: sameSize(d.original, d.current) ? d.view : null,
              undoStack: [...d.undoStack, { image: d.current, label: "Revert to original" }].slice(
                -MAX_UNDO,
              ),
              redoStack: [],
            },
      ),
    })),
  undo: (id) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => {
        const step = d.undoStack.at(-1);
        if (!step) return d;
        return {
          ...d,
          current: step.image,
          edits: d.edits.slice(0, -1),
          view: sameSize(step.image, d.current) ? d.view : null,
          undoStack: d.undoStack.slice(0, -1),
          redoStack: [...d.redoStack, { image: d.current, label: step.label }],
        };
      }),
    })),
  redo: (id) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => {
        const step = d.redoStack.at(-1);
        if (!step) return d;
        return {
          ...d,
          current: step.image,
          edits: [...d.edits, step.label],
          view: sameSize(step.image, d.current) ? d.view : null,
          undoStack: [...d.undoStack, { image: d.current, label: step.label }],
          redoStack: d.redoStack.slice(0, -1),
        };
      }),
    })),
}));

export function activeDocument(
  state: DocumentsState = useDocuments.getState(),
): ImageDocument | null {
  return state.documents.find((d) => d.id === state.activeId) ?? null;
}
