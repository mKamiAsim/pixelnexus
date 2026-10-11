/**
 * Open images. Each document keeps the original pixels untouched and a current version that
 * edits replace. Full history arrives in Phase 3. Until then "Revert to original" undoes everything.
 */
import { create } from "zustand";

import type { ViewState } from "@/canvas/viewport";
import type { DecodePath } from "@/core/image/decode";
import type { ImageHeader } from "@/core/image/format";
import type { LoadIssue } from "@/core/image/limits";
import type { RgbaImage } from "@/core/image/types";

export type DocumentSource = "file" | "paste" | "sample";

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
  /** Null until the viewport has measured itself and fitted the image. */
  readonly view: ViewState | null;
}

export type NewDocument = Omit<ImageDocument, "id" | "current" | "edits" | "view">;

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
}

let counter = 0;
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${++counter}`;

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
        { ...document, id, current: document.original, edits: [], view: null },
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
      documents: update(state.documents, id, (d) => {
        const resized = image.width !== d.current.width || image.height !== d.current.height;
        return { ...d, current: image, edits: [...d.edits, label], view: resized ? null : d.view };
      }),
    })),
  revert: (id) =>
    set((state) => ({
      documents: update(state.documents, id, (d) => {
        const resized =
          d.original.width !== d.current.width || d.original.height !== d.current.height;
        return { ...d, current: d.original, edits: [], view: resized ? null : d.view };
      }),
    })),
}));

export function activeDocument(
  state: DocumentsState = useDocuments.getState(),
): ImageDocument | null {
  return state.documents.find((d) => d.id === state.activeId) ?? null;
}
