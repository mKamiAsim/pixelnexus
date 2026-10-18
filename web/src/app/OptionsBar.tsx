import { X, ZoomIn, ZoomOut } from "lucide-react";

import { centeredView, fillZoom, fitView, type Size } from "@/canvas/viewport";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { activeDocument, useDocuments } from "@/state/documents";
import { isSelectionTool } from "@/selection/ids";
import { useUi } from "@/state/ui";

import { SelectionOptions } from "./SelectionOptions";

import { TOOL_ICONS } from "./toolIcons";
import { TOOLS } from "./tools";

/** Settings of the active tool, as in Photoshop's options bar. */
export function OptionsBar() {
  const tool = useUi((s) => s.tool);
  const info = TOOLS.find((t) => t.id === tool);
  return (
    <div
      role="toolbar"
      aria-label="Tool options"
      className="flex h-9 shrink-0 items-center gap-3 overflow-x-auto border-b border-border-subtle bg-panel-header px-2"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-text">
        <span className="text-accent-fg">{TOOL_ICONS[tool]}</span>
        {info?.label}
      </span>
      <span className="h-5 w-px shrink-0 bg-border" />
      {tool === "zoom" ? <ZoomOptions /> : null}
      {tool === "probe" ? <ProbeOptions /> : null}
      {tool === "hand" || tool === "zoom" ? <ViewButtons /> : null}
      {isSelectionTool(tool) ? <SelectionOptions tool={tool} /> : null}
      <span className="ml-auto hidden truncate text-xs text-text-muted lg:block">{info?.hint}</span>
    </div>
  );
}

function ViewButtons() {
  const doc = useDocuments((s) => activeDocument(s));
  const size = useUi((s) => s.viewportSize);
  const setView = useDocuments((s) => s.setView);
  const set = (make: (image: Size, view: Size) => ReturnType<typeof fitView>) => {
    if (doc && size) setView(doc.id, make(doc.current, size));
  };
  const disabled = !doc || !size;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => set((image, view) => centeredView(image, view, 1))}
      >
        100%
      </Button>
      <Button size="sm" disabled={disabled} onClick={() => set(fitView)}>
        Fit screen
      </Button>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => set((image, view) => centeredView(image, view, fillZoom(image, view)))}
      >
        Fill screen
      </Button>
    </div>
  );
}

function ZoomOptions() {
  const zoomOut = useUi((s) => s.zoomOut);
  const setZoomOut = useUi((s) => s.setZoomOut);
  return (
    <SegmentedControl
      label="Zoom direction on click"
      value={zoomOut ? "out" : "in"}
      onChange={(value) => setZoomOut(value === "out")}
      iconOnly
      segments={[
        { value: "in", label: "Zoom in on click", icon: <ZoomIn size={14} /> },
        { value: "out", label: "Zoom out on click", icon: <ZoomOut size={14} />, shortcut: "Alt" },
      ]}
    />
  );
}

function ProbeOptions() {
  const probe = useUi((s) => s.probe);
  const setProbe = useUi((s) => s.setProbe);
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
      <span>Sample size: 1 pixel</span>
      {probe ? (
        <Button size="sm" variant="ghost" onClick={() => setProbe(null)}>
          <X size={13} /> Unpin x {probe.x}, y {probe.y}
        </Button>
      ) : (
        <span className="text-text-muted">No pixel pinned</span>
      )}
    </div>
  );
}
