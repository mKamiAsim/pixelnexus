import { useEffect, useRef } from "react";

import { rulerSteps, type ViewState } from "@/canvas/viewport";
import { useUi } from "@/state/ui";

export const RULER_SIZE = 20;

/**
 * One ruler along the top or the left edge of the viewport. Numbers are image pixel
 * coordinates. A marker follows the pixel under the pointer.
 */
export function Ruler({
  axis,
  view,
  length,
  marker,
}: {
  axis: "x" | "y";
  view: ViewState;
  length: number;
  marker: number | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || length <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const horizontal = axis === "x";
    const width = horizontal ? length : RULER_SIZE;
    const height = horizontal ? RULER_SIZE : length;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const styles = getComputedStyle(canvas);
    const text = styles.getPropertyValue("--px-text-muted").trim() || "#777";
    context.fillStyle = styles.getPropertyValue("--px-panel-header").trim() || "#eee";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = text;
    context.fillStyle = text;
    context.lineWidth = 1;
    context.font = `10px ${styles.getPropertyValue("--font-mono") || "monospace"}`;
    context.textBaseline = "top";

    const pan = horizontal ? view.panX : view.panY;
    const { major, minor } = rulerSteps(view.zoom);
    const first = Math.floor(-pan / view.zoom / minor) * minor;
    const last = (length - pan) / view.zoom;
    context.beginPath();
    for (let v = first; v <= last; v += minor) {
      const s = Math.round(v * view.zoom + pan) + 0.5;
      const isMajor = Math.round(v) % major === 0;
      const tick = isMajor ? RULER_SIZE : RULER_SIZE * 0.3;
      if (horizontal) {
        context.moveTo(s, RULER_SIZE);
        context.lineTo(s, RULER_SIZE - tick);
      } else {
        context.moveTo(RULER_SIZE, s);
        context.lineTo(RULER_SIZE - tick, s);
      }
      if (isMajor) {
        const label = String(Math.round(v));
        if (horizontal) {
          context.fillText(label, s + 3, 2);
        } else {
          context.save();
          context.translate(2, s + 3);
          context.rotate(Math.PI / 2);
          context.translate(0, -RULER_SIZE + 4);
          context.fillText(label, 0, 0);
          context.restore();
        }
      }
    }
    context.stroke();
    if (marker !== null) {
      const s = Math.round((marker + 0.5) * view.zoom + pan) + 0.5;
      context.strokeStyle = styles.getPropertyValue("--px-accent").trim() || "#36f";
      context.beginPath();
      if (horizontal) {
        context.moveTo(s, 0);
        context.lineTo(s, RULER_SIZE);
      } else {
        context.moveTo(0, s);
        context.lineTo(RULER_SIZE, s);
      }
      context.stroke();
    }
  }, [axis, view, length, marker, theme]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={axis === "x" ? "block h-5 w-full" : "block h-full w-5"}
    />
  );
}
