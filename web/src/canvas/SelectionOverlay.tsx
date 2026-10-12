import type { ReactNode } from "react";

import { imageToScreen, type ViewState } from "@/canvas/viewport";
import type { Outline } from "@/selection/gestures";

/**
 * Outlines of selections being drawn, and the brush outline at the pointer. Each line is drawn
 * twice, white under black dashes, so it shows on any image.
 */
export function SelectionOverlay({
  outline,
  view,
  brush,
}: {
  outline: Outline | null;
  view: ViewState;
  /** Brush center and radius in screen pixels. */
  brush: { x: number; y: number; radius: number } | null;
}) {
  if (!outline && !brush) return null;
  const at = (x: number, y: number) => imageToScreen(view, x, y);
  const shapes: ReactNode[] = [];
  if (outline?.kind === "rect" || outline?.kind === "ellipse") {
    const a = at(Math.min(outline.x0, outline.x1), Math.min(outline.y0, outline.y1));
    const b = at(Math.max(outline.x0, outline.x1), Math.max(outline.y0, outline.y1));
    const props = { x: a.sx, y: a.sy, width: b.sx - a.sx, height: b.sy - a.sy };
    shapes.push(
      outline.kind === "rect" ? (
        <rect key="shape" {...props} />
      ) : (
        <ellipse
          key="shape"
          cx={props.x + props.width / 2}
          cy={props.y + props.height / 2}
          rx={props.width / 2}
          ry={props.height / 2}
        />
      ),
    );
  } else if (outline?.kind === "path") {
    const points = outline.points.map((p) => at(p.x, p.y));
    const list = points.map((p) => `${p.sx},${p.sy}`).join(" ");
    shapes.push(
      outline.closed ? (
        <polygon key="shape" points={list} />
      ) : (
        <polyline key="shape" points={list} />
      ),
    );
    const last = points[points.length - 1];
    if (outline.rubber && last) {
      const r = at(outline.rubber.x, outline.rubber.y);
      shapes.push(<line key="rubber" x1={last.sx} y1={last.sy} x2={r.sx} y2={r.sy} />);
    }
    const first = points[0];
    if (first && !outline.closed && outline.rubber) {
      shapes.push(<circle key="start" cx={first.sx} cy={first.sy} r={4} />);
    }
  }
  if (brush) {
    shapes.push(<circle key="brush" cx={brush.x} cy={brush.y} r={Math.max(1, brush.radius)} />);
  }
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" fill="none">
      <g stroke="white" strokeWidth={1}>
        {shapes}
      </g>
      <g stroke="black" strokeWidth={1} strokeDasharray="4 4">
        {shapes}
      </g>
    </svg>
  );
}
