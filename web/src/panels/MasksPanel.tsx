import {
  Download,
  SquareDashed,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, type ReactNode } from "react";

import { describeSelection, exportMask, importMask, loadSelection } from "@/app/selectionActions";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { maskToImage, type CombineMode, type Mask } from "@/core/mask/mask";
import type { RgbaImage } from "@/core/image/types";
import { activeDocument, useDocuments, type NamedMask } from "@/state/documents";
import { useUi } from "@/state/ui";

import { Thumbnail } from "./Thumbnail";

// Masks never change, so each gray image is made once.
const grayImages = new WeakMap<Mask, RgbaImage>();
const grayOf = (mask: Mask): RgbaImage => {
  let image = grayImages.get(mask);
  if (!image) {
    image = maskToImage(mask);
    grayImages.set(mask, image);
  }
  return image;
};

const LOAD_ACTIONS: readonly {
  mode: CombineMode;
  label: (name: string) => string;
  icon: ReactNode;
}[] = [
  { mode: "new", label: (n) => `Load "${n}" as the selection`, icon: <SquareDashed size={13} /> },
  { mode: "add", label: (n) => `Add "${n}" to the selection`, icon: <SquaresUnite size={13} /> },
  {
    mode: "subtract",
    label: (n) => `Subtract "${n}" from the selection`,
    icon: <SquaresSubtract size={13} />,
  },
  {
    mode: "intersect",
    label: (n) => `Intersect the selection with "${n}"`,
    icon: <SquaresIntersect size={13} />,
  },
];

/** The selection of the active image, and its saved masks. White is selected, black is not. */
export function MasksPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const deleteMask = useDocuments((s) => s.deleteMask);
  const setDialog = useUi((s) => s.setDialog);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!doc) {
    return <p className="p-3 text-sm text-text-secondary">Open an image to work with masks.</p>;
  }
  const selection = doc.selection;

  return (
    <div className="flex flex-col gap-3 p-2">
      <section aria-labelledby="masks-current" className="flex flex-col gap-2">
        <h3 id="masks-current" className="px-1 text-xs font-semibold text-text-secondary">
          Selection
        </h3>
        <div className="flex items-center gap-2.5 px-1">
          {selection ? (
            <Thumbnail image={grayOf(selection)} max={40} label="" />
          ) : (
            <div className="size-10 shrink-0 rounded-[3px] border border-border bg-black" />
          )}
          <p className="text-xs text-text-secondary">
            {describeSelection(selection)}
            {selection && !doc.selectionEnabled ? " (off)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 px-1">
          <Button size="sm" disabled={!selection} onClick={() => setDialog("select-save")}>
            Save selection
          </Button>
          <Button size="sm" disabled={!selection} onClick={() => void exportMask()}>
            <Download size={13} /> Export PNG
          </Button>
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            <Upload size={13} /> Import
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importMask(file);
            }}
          />
        </div>
      </section>
      <section aria-labelledby="masks-saved" className="flex flex-col gap-1">
        <h3 id="masks-saved" className="px-1 text-xs font-semibold text-text-secondary">
          Saved masks
        </h3>
        {doc.masks.length === 0 ? (
          <p className="px-1 text-xs text-text-muted">
            None yet. Make a selection, then choose Save selection. Saved masks stay with this image
            until you close it.
          </p>
        ) : (
          <ul aria-label="Saved masks" className="flex flex-col gap-0.5">
            {doc.masks.map((saved) => (
              <SavedMask
                key={saved.id}
                saved={saved}
                fits={
                  saved.mask.width === doc.current.width && saved.mask.height === doc.current.height
                }
                onDelete={() => deleteMask(doc.id, saved.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SavedMask({
  saved,
  fits,
  onDelete,
}: {
  saved: NamedMask;
  fits: boolean;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-control p-1 hover:bg-hover">
      <Thumbnail image={grayOf(saved.mask)} max={32} label="" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-text">{saved.name}</span>
        <span className="tabular truncate text-xs text-text-muted">
          {fits ? describeSelection(saved.mask).replace("Selection: ", "") : "Other image size"}
        </span>
      </span>
      {LOAD_ACTIONS.map((action) => (
        <IconButton
          key={action.mode}
          label={action.label(saved.name)}
          icon={action.icon}
          size="sm"
          disabled={!fits}
          onClick={() => loadSelection(saved.id, action.mode)}
        />
      ))}
      <IconButton
        label={`Delete "${saved.name}"`}
        icon={<Trash2 size={13} />}
        size="sm"
        onClick={onDelete}
      />
    </li>
  );
}
