import { clsx } from "clsx";
import type { ReactNode } from "react";
import {
  Columns2,
  Diff,
  Eye,
  Layers2,
  Maximize,
  SplitSquareHorizontal,
  Square,
  X,
} from "lucide-react";

import { fitView, formatZoom } from "@/canvas/viewport";
import { displayShortcut } from "@/app/shortcuts";
import { ImageViewport } from "@/canvas/ImageViewport";
import { Ruler } from "@/canvas/Rulers";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { activeDocument, useDocuments, type ImageDocument } from "@/state/documents";
import { useSettings } from "@/state/settings";
import { useUi, type CompareMode } from "@/state/ui";

import { EmptyState } from "./EmptyState";

const COMPARE_SEGMENTS = [
  { value: "off", label: "No comparison", icon: <Square size={14} /> },
  { value: "split", label: "Split view", icon: <SplitSquareHorizontal size={14} /> },
  { value: "side-by-side", label: "Side by side", icon: <Columns2 size={14} /> },
  { value: "overlay", label: "Overlay", icon: <Layers2 size={14} /> },
  { value: "difference", label: "Difference", icon: <Diff size={14} /> },
];

/** The center of the workspace: document tabs, the viewport and the compare bar. */
export function CanvasPanel() {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const doc = useDocuments((s) => activeDocument(s));
  const rulers = useSettings((s) => s.rulers);
  if (documents.length === 0 || !doc) return <EmptyState />;
  return (
    <div className="flex h-full flex-col bg-canvas">
      <DocumentTabs activeId={activeId} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {rulers ? (
          <RulerFrame document={doc}>
            <ImageViewport key={doc.id} document={doc} />
          </RulerFrame>
        ) : (
          <ImageViewport key={doc.id} document={doc} />
        )}
        <CompareBar />
      </div>
    </div>
  );
}

/** Rulers along the top and left edges. Numbers are image pixel coordinates. */
function RulerFrame({ document: doc, children }: { document: ImageDocument; children: ReactNode }) {
  const size = useUi((s) => s.viewportSize);
  const hover = useUi((s) => s.hover);
  const marker = hover?.documentId === doc.id ? hover : null;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[20px_1fr] grid-rows-[20px_1fr]">
      <span aria-hidden className="border-r border-b border-border-subtle bg-panel-header" />
      <div className="min-w-0 overflow-hidden border-b border-border-subtle">
        {doc.view && size ? (
          <Ruler axis="x" view={doc.view} length={size.width} marker={marker?.x ?? null} />
        ) : null}
      </div>
      <div className="min-h-0 overflow-hidden border-r border-border-subtle">
        {doc.view && size ? (
          <Ruler axis="y" view={doc.view} length={size.height} marker={marker?.y ?? null} />
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
    </div>
  );
}

function DocumentTabs({ activeId }: { activeId: string | null }) {
  const documents = useDocuments((s) => s.documents);
  const activate = useDocuments((s) => s.activate);
  const close = useDocuments((s) => s.close);
  return (
    // A list of buttons, not an ARIA tablist: a tablist may only hold tabs, and each
    // document also has a close button.
    <ul
      aria-label="Document tabs"
      className="flex h-7 shrink-0 items-stretch overflow-x-auto border-b border-border-subtle bg-panel-header"
    >
      {documents.map((d) => {
        const active = d.id === activeId;
        return (
          <li
            key={d.id}
            className={clsx(
              "group flex shrink-0 items-center gap-1.5 border-r border-border-subtle pr-1 pl-3 text-xs",
              active ? "bg-canvas text-text" : "text-text-muted hover:text-text-secondary",
            )}
          >
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => activate(d.id)}
              className="flex h-full items-center gap-2"
            >
              <span className="max-w-48 truncate">{d.name}</span>
              {d.view ? (
                <span className="tabular text-text-muted">{formatZoom(d.view.zoom)}</span>
              ) : null}
              {d.index > 0 ? (
                <>
                  <span aria-hidden className="size-1.5 rounded-full bg-accent-fg" title="Edited" />
                  <span className="sr-only">, edited</span>
                </>
              ) : null}
            </button>
            <button
              type="button"
              aria-label={`Close ${d.name}`}
              onClick={() => close(d.id)}
              className={clsx(
                "rounded-[3px] p-0.5 text-text-muted hover:bg-hover hover:text-text",
                active
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <X size={12} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CompareBar() {
  const compare = useUi((s) => s.compare);
  const setCompare = useUi((s) => s.setCompare);
  const opacity = useUi((s) => s.overlayOpacity);
  const setOpacity = useUi((s) => s.setOverlayOpacity);
  const doc = useDocuments((s) => activeDocument(s));
  const size = useUi((s) => s.viewportSize);
  const setView = useDocuments((s) => s.setView);
  const showOriginal = useUi((s) => s.showOriginal);
  const setShowOriginal = useUi((s) => s.setShowOriginal);
  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-panel bg-overlay p-1 shadow-popover">
      <SegmentedControl
        label="Compare with the original"
        value={compare}
        onChange={(value) => setCompare(value as CompareMode)}
        segments={COMPARE_SEGMENTS}
        iconOnly
      />
      {compare === "overlay" ? (
        <label className="flex items-center gap-1.5 px-1 text-xs text-text-secondary">
          Original
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(event) => setOpacity(Number(event.target.value) / 100)}
            aria-label="Opacity of the original"
            className="w-20 accent-[var(--px-accent)]"
          />
        </label>
      ) : null}
      <IconButton
        label="Hold to see the original"
        shortcut={"\\"}
        icon={<Eye size={14} />}
        size="sm"
        pressed={showOriginal}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setShowOriginal(true);
        }}
        onPointerUp={() => setShowOriginal(false)}
        onPointerCancel={() => setShowOriginal(false)}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") setShowOriginal(true);
        }}
        onKeyUp={() => setShowOriginal(false)}
        onBlur={() => setShowOriginal(false)}
      />
      <span className="h-4 w-px bg-border" />
      <IconButton
        label="Fit on screen"
        shortcut={displayShortcut("Mod+0")}
        icon={<Maximize size={14} />}
        size="sm"
        onClick={() => {
          if (doc && size) setView(doc.id, fitView(doc.current, size));
        }}
      />
      <span className="tabular min-w-12 px-1 text-center font-mono text-xs text-text-secondary">
        {doc?.view ? formatZoom(doc.view.zoom) : ""}
      </span>
    </div>
  );
}
