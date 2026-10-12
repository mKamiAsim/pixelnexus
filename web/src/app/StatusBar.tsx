import { LoaderCircle, ShieldCheck } from "lucide-react";

import { formatZoom } from "@/canvas/viewport";
import { getChannel } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

import { formatSize } from "./format";

/** Facts about the active image and the pixel under the pointer. */
export function StatusBar() {
  const doc = useDocuments((s) => activeDocument(s));
  const hover = useUi((s) => s.hover);
  const work = useUi((s) => s.work);
  const progress = useFilters((s) => s.applying?.progress);
  const point = doc && hover?.documentId === doc.id ? hover : null;
  const image = doc?.current;
  const inside = image && point && point.x < image.width && point.y < image.height;
  const rgba =
    image && point && inside
      ? [0, 1, 2, 3].map((c) => getChannel(image, point.x, point.y, c)).join(", ")
      : null;

  return (
    <footer className="tabular flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-border-subtle bg-panel px-3 text-xs whitespace-nowrap text-text-muted">
      {doc && image ? (
        <>
          <span>{formatSize(image)}</span>
          <span className="hidden sm:inline">8-bit RGBA, sRGB</span>
          <span>Zoom {doc.view ? formatZoom(doc.view.zoom) : ""}</span>
          <span className="hidden min-w-40 font-mono md:inline">
            {point && rgba
              ? `x ${point.x}, y ${point.y}  RGBA ${rgba}`
              : "Pointer outside the image"}
          </span>
          <span className="hidden lg:inline">No selection</span>
        </>
      ) : (
        <span>No image open</span>
      )}
      <span className="hidden lg:inline">Engine: browser</span>
      {work.length > 0 ? (
        <span className="flex items-center gap-1.5 text-text-secondary">
          <LoaderCircle size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />
          {work[work.length - 1]}
          {progress !== undefined ? ` ${Math.round(progress * 100)}%` : ""}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-1.5">
        <ShieldCheck size={12} className="text-success" aria-hidden />
        Images are processed locally in your browser.
      </span>
    </footer>
  );
}
