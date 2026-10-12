import { ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import {
  clampPan,
  formatZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoomStep,
  zoomAt,
  type ViewState,
} from "@/canvas/viewport";
import { IconButton } from "@/components/ui/IconButton";
import { activeDocument, useDocuments } from "@/state/documents";
import { useUi } from "@/state/ui";

const PADDING = 12;
const MAX_HEIGHT = 220;

/** A small map of the whole image. The frame shows the visible part. Drag to move the view. */
export function NavigatorPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const setView = useDocuments((s) => s.setView);
  const viewport = useUi((s) => s.viewportSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setPanelWidth(entry?.contentRect.width ?? 0));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const image = doc?.current ?? null;
  const scale = image
    ? Math.min((panelWidth - 2 * PADDING) / image.width, MAX_HEIGHT / image.height)
    : 0;
  const thumbWidth = image ? Math.max(1, Math.round(image.width * scale)) : 0;
  const thumbHeight = image ? Math.max(1, Math.round(image.height * scale)) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || thumbWidth < 2) return;
    let cancelled = false;
    const dpr = window.devicePixelRatio || 1;
    void createImageBitmap(new ImageData(image.data, image.width, image.height), {
      resizeWidth: Math.max(1, Math.round(thumbWidth * dpr)),
      resizeHeight: Math.max(1, Math.round(thumbHeight * dpr)),
      resizeQuality: "high",
    }).then((bitmap) => {
      if (cancelled) return bitmap.close();
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
    });
    return () => {
      cancelled = true;
    };
  }, [image, thumbWidth, thumbHeight]);

  const change = (update: (view: ViewState) => ViewState) => {
    if (!doc?.view || !viewport) return;
    setView(doc.id, clampPan(update(doc.view), doc.current, viewport));
  };

  /** Center the main view on the image point under the pointer. */
  const centerOn = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    change((view) => {
      if (!viewport) return view;
      return {
        ...view,
        panX: viewport.width / 2 - x * view.zoom,
        panY: viewport.height / 2 - y * view.zoom,
      };
    });
  };

  const view = doc?.view;
  const frame =
    view && viewport && scale > 0
      ? {
          left: (-view.panX / view.zoom) * scale,
          top: (-view.panY / view.zoom) * scale,
          width: (viewport.width / view.zoom) * scale,
          height: (viewport.height / view.zoom) * scale,
        }
      : null;

  const logMin = Math.log(MIN_ZOOM);
  const logMax = Math.log(MAX_ZOOM);
  const sliderValue = view
    ? Math.round(((Math.log(view.zoom) - logMin) / (logMax - logMin)) * 1000)
    : 0;
  const zoomTo = (zoom: number) =>
    change((current) =>
      viewport ? zoomAt(current, zoom, viewport.width / 2, viewport.height / 2) : current,
    );

  return (
    <div ref={containerRef} className="flex h-full flex-col gap-2 overflow-hidden py-3">
      {!doc ? (
        <p className="px-3 text-sm text-text-secondary">Open an image to see the navigator.</p>
      ) : (
        <>
          <div
            className="checkerboard relative mx-auto touch-none overflow-hidden border border-border"
            style={{ width: thumbWidth, height: thumbHeight }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              centerOn(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) centerOn(event);
            }}
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Overview of ${doc.name}`}
              className="absolute inset-0 size-full"
            />
            {frame ? (
              <span
                aria-hidden
                className="pointer-events-none absolute border-2 border-danger shadow-[0_0_0_1px_rgb(255_255_255/0.6)]"
                style={frame}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 px-3">
            <IconButton
              label="Zoom out"
              icon={<ZoomOut size={14} />}
              size="sm"
              onClick={() => view && zoomTo(nextZoomStep(view.zoom, -1))}
            />
            <input
              type="range"
              min={0}
              max={1000}
              value={sliderValue}
              aria-label="Zoom"
              aria-valuetext={view ? formatZoom(view.zoom) : undefined}
              onChange={(event) =>
                zoomTo(Math.exp(logMin + (Number(event.target.value) / 1000) * (logMax - logMin)))
              }
              className="min-w-0 flex-1 accent-[var(--px-accent)]"
            />
            <IconButton
              label="Zoom in"
              icon={<ZoomIn size={14} />}
              size="sm"
              onClick={() => view && zoomTo(nextZoomStep(view.zoom, 1))}
            />
            <span className="tabular w-12 text-right font-mono text-xs text-text-secondary">
              {view ? formatZoom(view.zoom) : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
