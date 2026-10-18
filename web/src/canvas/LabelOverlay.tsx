import { useEffect, useMemo, useRef } from "react";

import type { ViewState } from "@/canvas/viewport";
import { paintLabels, type LabelMap } from "@/core/features/labels";

/** How opaque the inside of each region is. Boundaries are fully opaque. */
export const REGION_ALPHA = 100;

/**
 * The regions of a segmentation result, drawn over the image in their label colors, see
 * through, with opaque boundaries. It follows the view's pan and zoom, pixel for pixel.
 */
export function LabelOverlay({ labels, view }: { labels: LabelMap; view: ViewState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const painted = useMemo(() => paintLabels(labels, REGION_ALPHA), [labels]);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = painted.width;
    canvas.height = painted.height;
    context.putImageData(new ImageData(painted.data, painted.width, painted.height), 0, 0);
  }, [painted]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      data-testid="label-overlay"
      className="pointer-events-none absolute top-0 left-0 origin-top-left"
      style={{
        width: labels.width,
        height: labels.height,
        imageRendering: "pixelated",
        transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
      }}
    />
  );
}
