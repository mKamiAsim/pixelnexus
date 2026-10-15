import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo } from "react";

import { formatZoom } from "@/canvas/viewport";
import { getChannel } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useEngine, watchEngine } from "@/state/engine";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

import { formatSize } from "./format";
import { describeSelection } from "./selectionActions";

/** Facts about the active image and the pixel under the pointer. */
export function StatusBar() {
  const doc = useDocuments((s) => activeDocument(s));
  const hover = useUi((s) => s.hover);
  const work = useUi((s) => s.work);
  const progress = useFilters((s) => s.applying?.progress);
  const selection = doc?.selection ?? null;
  // Counting the selected pixels reads the whole mask, so do it once per selection.
  const selectionText = useMemo(() => describeSelection(selection), [selection]);
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
          <span className="hidden lg:inline">
            {selectionText}
            {selection && !doc.selectionEnabled ? " (off)" : ""}
          </span>
        </>
      ) : (
        <span>No image open</span>
      )}
      <EngineLight />
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

const ENGINE_TEXT = {
  checking: "Local engine: checking",
  online: "Local engine: on",
  offline: "Local engine: off",
} as const;

/**
 * Whether the local science engine answers. Browser filters work either way. A click checks
 * again at once.
 */
function EngineLight() {
  const status = useEngine((s) => s.status);
  const version = useEngine((s) => s.version);
  const check = useEngine((s) => s.check);
  useEffect(() => watchEngine(), []);
  const color =
    status === "online" ? "bg-success" : status === "offline" ? "bg-text-muted" : "bg-warning";
  const title =
    status === "online"
      ? `The PixelNexus engine ${version ?? ""} runs on this computer. Advanced filters can run.`
      : status === "offline"
        ? "The PixelNexus engine is not running. Browser filters work. Start the engine with: uv run pixelnexus-engine"
        : "Looking for the PixelNexus engine on this computer.";
  return (
    <button
      type="button"
      onClick={() => void check()}
      title={title}
      className="hidden items-center gap-1.5 rounded-control px-1 hover:text-text-secondary lg:flex"
    >
      <span className={`inline-block size-2 rounded-full ${color}`} aria-hidden />
      {ENGINE_TEXT[status]}
    </button>
  );
}
