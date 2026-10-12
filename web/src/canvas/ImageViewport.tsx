import { clsx } from "clsx";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { cssColor, ImageRenderer, type RenderMode } from "@/canvas/renderer";
import { SelectionOverlay } from "@/canvas/SelectionOverlay";
import {
  clampPan,
  fitView,
  formatZoom,
  imageToScreen,
  nextZoomStep,
  panBy,
  pixelAt,
  screenToImage,
  zoomAt,
  type Size,
  type ViewState,
} from "@/canvas/viewport";
import { commitSelection } from "@/app/selectionActions";
import { TOOLS } from "@/app/tools";
import type { Rect } from "@/core/filters/run";
import type { Mask } from "@/core/mask/mask";
import {
  createGesture,
  type Gesture,
  type GestureUpdate,
  type Modifiers,
  type Outline,
} from "@/selection/gestures";
import { BRUSH_TOOLS, isSelectionTool } from "@/selection/ids";
import { toolValues } from "@/selection/values";
import { useDocuments, type ImageDocument } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useSelection } from "@/state/selection";
import { useUi } from "@/state/ui";

/** Wheel distance that doubles or halves the zoom. */
const WHEEL_ZOOM_SPEED = 0.0025;

/** Milliseconds between steps of the marching ants. */
const ANTS_STEP_MS = 120;

const union = (a: Rect | null, b: Rect | null): Rect | null => {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

const modifiers = (event: { shiftKey: boolean; altKey: boolean }): Modifiers => ({
  shift: event.shiftKey,
  alt: event.altKey,
});

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable=true]"));
}

/**
 * The image viewport for one document.
 *
 * - Drag with the Hand tool, the middle button, or while holding Space to pan.
 * - Scroll to pan. Hold Ctrl, Cmd or Alt while scrolling, or pinch, to zoom at the pointer.
 * - Click with the Zoom tool to zoom in, Alt-click to zoom out.
 * - Click with the Probe tool to pin a pixel for the Info panel.
 * - Selection tools turn pointer input into selections through their gestures.
 * - With the canvas focused, arrow keys pan.
 */
export function ImageViewport({ document: doc }: { document: ImageDocument }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ImageRenderer | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  const setView = useDocuments((s) => s.setView);
  const tool = useUi((s) => s.tool);
  const zoomOut = useUi((s) => s.zoomOut);
  const compare = useUi((s) => s.compare);
  const split = useUi((s) => s.split);
  const setSplit = useUi((s) => s.setSplit);
  const overlayOpacity = useUi((s) => s.overlayOpacity);
  const showOriginal = useUi((s) => s.showOriginal);
  const pixelGrid = useUi((s) => s.pixelGrid);
  const theme = useUi((s) => s.theme);
  // Read the theme colors once per theme. Reading CSS on every frame forces a style recalculation.
  const colors = useMemo(
    () => ({
      pasteboard: cssColor("--px-canvas"),
      checkerA: cssColor("--px-checker-a"),
      checkerB: cssColor("--px-checker-b"),
    }),
    // The theme is not used inside, but a new theme means new CSS values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
  const probe = useUi((s) => s.probe);
  const preview = useFilters((s) => s.preview);
  const setHover = useUi((s) => s.setHover);
  const setProbe = useUi((s) => s.setProbe);
  const maskView = useSelection((s) => s.maskView);
  const previewScope = useFilters((s) => s.scope);

  // Selection gestures. A draft is a selection being painted, shown until it is committed.
  // Each belongs to one tool, document and history step. When any of them changes, the old
  // gesture, outline and draft no longer match the key and are ignored.
  const gesture = useRef<{ key: string; gesture: Gesture } | null>(null);
  const [outline, setOutline] = useState<{ key: string; outline: Outline } | null>(null);
  const [draft, setDraft] = useState<{ key: string; mask: Mask; version: number } | null>(null);
  const pendingDirty = useRef<Rect | null>(null);
  const [antsPhase, setAntsPhase] = useState(0);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // Plain names for the document fields. Effects depend on these, not on the document object.
  const { id: docId, current: image, original, view } = doc;
  const gestureKey = `${tool}|${docId}|${doc.steps[doc.index]?.id ?? 0}`;
  const shownOutline = outline?.key === gestureKey ? outline.outline : null;
  const shownDraft = draft?.key === gestureKey ? draft : null;
  const shownMask = shownDraft?.mask ?? (doc.selectionEnabled ? doc.selection : null);
  // A filter preview of this exact image, if there is one. It stays visible while a newer one runs.
  const previewShown = useMemo(
    () =>
      preview.result && preview.region && preview.documentId === docId && preview.source === image
        ? { result: preview.result, region: preview.region }
        : null,
    [preview, docId, image],
  );

  // Latest values for event handlers that are attached once.
  const latest = useRef({ doc, size });
  useLayoutEffect(() => {
    latest.current = { doc, size };
  });

  const updateView = useCallback(
    (change: (view: ViewState) => ViewState) => {
      const { doc: current, size: viewSize } = latest.current;
      if (!current.view || !viewSize) return;
      setView(current.id, clampPan(change(current.view), current.current, viewSize));
    },
    [setView],
  );

  // Create the renderer, and recreate it if the browser drops the WebGL context.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const create = () => {
      try {
        rendererRef.current = new ImageRenderer(canvas);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The viewport could not start.");
      }
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      rendererRef.current = null;
    };
    const onRestored = () => {
      create();
      setContextVersion((v) => v + 1);
    };
    create();
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Track the viewport size in CSS pixels.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Tell the rest of the app how large the active viewport is, for Fit and 100%.
  const setViewportSize = useUi((s) => s.setViewportSize);
  useEffect(() => {
    setViewportSize(size);
  }, [size, setViewportSize]);

  // Fit the image the first time, and after an edit that changes its size.
  useEffect(() => {
    if (size && !view && size.width > 0 && size.height > 0) {
      setView(docId, fitView(image, size));
    }
  }, [size, view, docId, image, setView]);

  // Draw when anything visible changes.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !size || !view) return;
    const frame = requestAnimationFrame(() => {
      try {
        // While a preview shows, the compare modes compare the image before and after the filter.
        renderer.setImages(image, previewShown ? image : original);
        renderer.setPreview(previewShown?.result ?? null, previewShown?.region ?? null);
        renderer.setMask(shownMask);
        if (pendingDirty.current) {
          renderer.updateMask(pendingDirty.current);
          pendingDirty.current = null;
        }
        const mode: RenderMode = showOriginal
          ? "original"
          : compare === "split" || compare === "overlay" || compare === "difference"
            ? compare
            : "current";
        renderer.render({
          view,
          width: size.width,
          height: size.height,
          dpr: window.devicePixelRatio || 1,
          mode,
          sideBySide: compare === "side-by-side" && !showOriginal,
          splitX: split * size.width,
          overlayOpacity,
          pixelGrid,
          colors,
          maskView,
          antsPhase,
          previewScope,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The image could not be drawn.");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    image,
    original,
    view,
    size,
    compare,
    split,
    overlayOpacity,
    showOriginal,
    pixelGrid,
    colors,
    contextVersion,
    previewShown,
    shownMask,
    shownDraft?.version,
    maskView,
    antsPhase,
    previewScope,
  ]);

  // March the ants, unless the system asks for less motion.
  const marching = Boolean(shownMask) && maskView === "ants";
  useEffect(() => {
    if (!marching || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setAntsPhase((p) => (p + 1) % 8), ANTS_STEP_MS);
    return () => window.clearInterval(timer);
  }, [marching]);

  const applyGesture = (update: GestureUpdate) => {
    if (update.outline !== undefined) {
      setOutline(update.outline ? { key: gestureKey, outline: update.outline } : null);
    }
    if (update.draft !== undefined) {
      const next = update.draft;
      if (next) {
        // A new draft mask is uploaded whole. Later changes upload only their rectangle.
        pendingDirty.current =
          shownDraft?.mask === next.mask ? union(pendingDirty.current, next.dirty) : null;
        setDraft((d) => ({ key: gestureKey, mask: next.mask, version: (d?.version ?? 0) + 1 }));
      } else {
        pendingDirty.current = null;
        setDraft(null);
      }
    }
    if (update.commit) commitSelection(docId, update.commit.mask, update.commit.label);
    if (update.end) gesture.current = null;
  };

  /** The running gesture of this tool, document and step, or a new one. */
  const currentGesture = (): Gesture | null => {
    if (gesture.current?.key === gestureKey) return gesture.current.gesture;
    if (!isSelectionTool(tool) || !view) return null;
    const created = createGesture(tool, {
      image,
      selection: doc.selectionEnabled ? doc.selection : null,
      mode: useSelection.getState().mode,
      values: toolValues(tool),
      zoom: view.zoom,
      label: TOOLS.find((t) => t.id === tool)?.label ?? tool,
    });
    gesture.current = created ? { key: gestureKey, gesture: created } : null;
    return created;
  };
  const runningGesture = () =>
    gesture.current?.key === gestureKey ? gesture.current.gesture : null;

  // Wheel: pan, or zoom with a modifier key or a pinch gesture (which arrives with ctrlKey set).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const dx = event.deltaX * scale;
      const dy = event.deltaY * scale;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        updateView((view) => zoomAt(view, view.zoom * Math.exp(-dy * WHEEL_ZOOM_SPEED), sx, sy));
      } else if (event.shiftKey && dx === 0) {
        updateView((view) => panBy(view, -dy, 0));
      } else {
        updateView((view) => panBy(view, -dx, -dy));
      }
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [updateView]);

  // Space switches to the Hand tool while held.
  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event.target)) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Pointer input. Two touch points pinch and pan together.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ distance: number; x: number; y: number } | null>(null);
  const lastHover = useRef<string>("");

  const local = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        pinch.current = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        };
        drag.current = null;
      }
      return;
    }
    const wantsPan = event.button === 1 || spaceHeld || tool === "hand";
    if (wantsPan) {
      event.preventDefault();
      drag.current = point;
      setPanning(true);
      return;
    }
    if (event.button !== 0 || !doc.view) return;
    if (isSelectionTool(tool)) {
      const g = currentGesture();
      const p = screenToImage(doc.view, point.x, point.y);
      if (g) applyGesture(g.down({ x: p.x, y: p.y }, modifiers(event)));
      return;
    }
    if (tool === "zoom") {
      updateView((view) =>
        zoomAt(view, nextZoomStep(view.zoom, event.altKey !== zoomOut ? -1 : 1), point.x, point.y),
      );
    } else if (tool === "probe") {
      const pixel = pixelAt(doc.view, doc.current, point.x, point.y);
      setProbe(pixel ? { documentId: doc.id, ...pixel } : null);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = local(event);
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, point);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const previous = pinch.current;
      updateView((view) =>
        panBy(
          zoomAt(view, view.zoom * (distance / Math.max(1, previous.distance)), mid.x, mid.y),
          mid.x - previous.x,
          mid.y - previous.y,
        ),
      );
      pinch.current = { distance, ...mid };
      return;
    }
    if (drag.current) {
      const start = drag.current;
      updateView((view) => panBy(view, point.x - start.x, point.y - start.y));
      drag.current = point;
    } else if (runningGesture() && doc.view) {
      const g = runningGesture();
      const p = screenToImage(doc.view, point.x, point.y);
      const pressed = (event.buttons & 1) === 1;
      const update = pressed
        ? g?.drag({ x: p.x, y: p.y }, modifiers(event))
        : g?.hover?.({ x: p.x, y: p.y });
      if (update) applyGesture(update);
    }
    if (BRUSH_TOOLS.includes(tool as never)) setPointer(point);
    if (doc.view) {
      const pixel = pixelAt(doc.view, doc.current, point.x, point.y);
      const key = pixel ? `${pixel.x},${pixel.y}` : "";
      if (key !== lastHover.current) {
        lastHover.current = key;
        setHover(pixel ? { documentId: doc.id, ...pixel } : null);
      }
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const g = runningGesture();
    if (g && doc.view && event.button === 0 && !drag.current) {
      const point = local(event);
      const p = screenToImage(doc.view, point.x, point.y);
      applyGesture(g.up({ x: p.x, y: p.y }, modifiers(event)));
    }
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setPanning(false);
    }
  };

  const onPointerLeave = () => {
    lastHover.current = "";
    setHover(null);
    setPointer(null);
  };

  const onDoubleClick = () => {
    const g = runningGesture();
    if (g?.doubleClick) {
      applyGesture(g.doubleClick());
      return;
    }
    if (!size) return;
    if (tool === "hand") setView(doc.id, fitView(doc.current, size));
    if (tool === "zoom") updateView((view) => zoomAt(view, 1, size.width / 2, size.height / 2));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const handled = runningGesture()?.key?.(event.key);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      applyGesture(handled);
      return;
    }
    const step = event.shiftKey ? 160 : 40;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      updateView((view) => panBy(view, move[0], move[1]));
    }
  };

  const cursor = panning
    ? "cursor-grabbing"
    : spaceHeld || tool === "hand"
      ? "cursor-grab"
      : tool === "zoom"
        ? "cursor-zoom-in"
        : "cursor-crosshair";

  const probeMark =
    probe && probe.documentId === doc.id && doc.view
      ? imageToScreen(doc.view, probe.x + 0.5, probe.y + 0.5)
      : null;
  const comparing = compare !== "off" && !showOriginal;
  const zoomLabel = doc.view ? formatZoom(doc.view.zoom) : "";

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`${doc.name}, ${doc.current.width} by ${doc.current.height} pixels, zoom ${zoomLabel}`}
        className={clsx(
          "absolute inset-0 size-full touch-none outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
          cursor,
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      />
      {doc.view ? (
        <SelectionOverlay
          outline={shownOutline}
          view={doc.view}
          brush={
            pointer && BRUSH_TOOLS.includes(tool as never) && isSelectionTool(tool)
              ? {
                  ...pointer,
                  radius: (Number(toolValues(tool).size ?? 30) / 2) * doc.view.zoom,
                }
              : null
          }
        />
      ) : null}
      {probeMark ? (
        <span
          aria-hidden
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
          style={{ left: probeMark.sx, top: probeMark.sy }}
        />
      ) : null}
      {comparing && (compare === "split" || compare === "side-by-side") ? (
        <>
          <CompareLabel side="left" text={previewShown ? "Before" : "Original"} />
          <CompareLabel
            side="right"
            text={
              previewShown
                ? "After (preview)"
                : doc.index > 0
                  ? "Current"
                  : "Current (no edits yet)"
            }
          />
        </>
      ) : null}
      {comparing && compare === "split" && size ? (
        <SplitHandle x={split * size.width} width={size.width} onChange={setSplit} />
      ) : null}
      {error ? (
        <div
          role="alert"
          className="absolute inset-x-4 top-4 rounded-control border border-danger/50 bg-overlay p-3 text-sm text-text shadow-popover"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function CompareLabel({ side, text }: { side: "left" | "right"; text: string }) {
  return (
    <span
      className={clsx(
        "pointer-events-none absolute top-2 rounded-control bg-overlay/90 px-2 py-0.5 text-xs text-text shadow-popover",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      {text}
    </span>
  );
}

function SplitHandle({
  x,
  width,
  onChange,
}: {
  x: number;
  width: number;
  onChange: (split: number) => void;
}) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (rect) onChange((event.clientX - rect.left) / width);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft") onChange(x / width - step);
    if (event.key === "ArrowRight") onChange(x / width + step);
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Compare split position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((x / width) * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize touch-none focus-visible:outline-2 focus-visible:outline-focus"
      style={{ left: x }}
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]" />
      <span className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60" />
    </div>
  );
}
