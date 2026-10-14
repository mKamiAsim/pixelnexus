/**
 * Live preview, following the preview policy in PLAN.md section 3.7.
 *
 * - Images up to FULL_PREVIEW_PIXELS are previewed whole, at full resolution. The preview is
 *   exact and stays valid while you zoom and pan.
 * - Larger images at 50% zoom or more preview the visible part plus a margin, at full
 *   resolution. Exact, unless the output mapping stretches to the range of the region.
 * - Larger images below 50% zoom preview a smaller copy. Parameters in pixels are scaled to
 *   the copy, and the preview says it is approximate.
 *
 * Previews are cached by image, filter, values and region, and a new request cancels the
 * previous one.
 */
import { isRunnable, type Filter } from "@/catalog";
import { entryParams } from "@/catalog/params";
import { screenToImage, type Size, type ViewState } from "@/canvas/viewport";
import { formatNotches, parseNotches } from "@/core/filters/frequency/notch";
import type { Rect } from "@/core/filters/run";
import type { ParamValue } from "@/core/filters/types";
import { resizeImage } from "@/core/image/resize";
import type { RgbaImage } from "@/core/image/types";
import { runJob } from "@/engine-client";
import { activeDocument, useDocuments } from "@/state/documents";
import { NO_PREVIEW, useFilters, type PreviewState } from "@/state/filters";
import { useUi } from "@/state/ui";

import { filterById, filterValues } from "./filterActions";
import { guideImageFor } from "./guide";

export const FULL_PREVIEW_PIXELS = 4_000_000;
const REGION_MARGIN = 64;
const PROXY_MAX_SIDE = 2048;
const DEBOUNCE_MS = 120;

export interface PreviewPlan {
  /** The part of the source to compute, in source pixels. */
  readonly region: Rect;
  /** Source resolution relative to the image. 1 means full resolution. */
  readonly scale: number;
  readonly approximate: boolean;
  readonly note: string | null;
}

/** Decide what to compute for a preview. Pure, so it is easy to test. */
export function planPreview(
  image: { width: number; height: number },
  view: ViewState | null,
  viewport: Size | null,
  normalizes: boolean,
): PreviewPlan {
  const full = { x: 0, y: 0, width: image.width, height: image.height };
  if (image.width * image.height <= FULL_PREVIEW_PIXELS || !view || !viewport) {
    return { region: full, scale: 1, approximate: false, note: null };
  }
  if (view.zoom >= 0.5) {
    const a = screenToImage(view, 0, 0);
    const b = screenToImage(view, viewport.width, viewport.height);
    const x0 = Math.max(0, Math.floor(a.x) - REGION_MARGIN);
    const y0 = Math.max(0, Math.floor(a.y) - REGION_MARGIN);
    const x1 = Math.min(image.width, Math.ceil(b.x) + REGION_MARGIN);
    const y1 = Math.min(image.height, Math.ceil(b.y) + REGION_MARGIN);
    const region = { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
    const whole = region.width === image.width && region.height === image.height;
    return normalizes && !whole
      ? {
          region,
          scale: 1,
          approximate: true,
          note: "Approximate preview: the stretch uses the range of the visible part only.",
        }
      : { region, scale: 1, approximate: false, note: null };
  }
  const longest = Math.max(image.width, image.height);
  const target = Math.min(
    PROXY_MAX_SIDE,
    Math.ceil(Math.max(viewport.width, viewport.height) * 1.5),
  );
  const scale = Math.min(1, target / longest);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  return {
    region: { x: 0, y: 0, width, height },
    scale: width / image.width,
    approximate: true,
    note: `Approximate preview at ${Math.round(scale * 100)}% size. Sizes in pixels are scaled to match.`,
  };
}

/**
 * Scale parameters measured in pixels to a smaller copy of the image. Frequencies in cycles per
 * pixel grow by the same factor, since a detail spans fewer pixels on the copy. Pyramid level
 * counts drop by one for each halving of the size.
 */
export function scaleParams(
  entry: Filter,
  values: Readonly<Record<string, ParamValue>>,
  scale: number,
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = { ...values };
  for (const param of entryParams(entry)) {
    const value = values[param.key];
    if (param.type === "points" && param.unit === "cycles/px" && typeof value === "string") {
      // Points that move past the highest frequency of the copy cannot be seen there.
      const parsed = parseNotches(value);
      if (parsed.ok) {
        out[param.key] = formatNotches(
          parsed.notches
            .map((n) => ({ fx: n.fx / scale, fy: n.fy / scale }))
            .filter((n) => Math.abs(n.fx) <= 0.5 && Math.abs(n.fy) <= 0.5),
        );
      }
      continue;
    }
    if (typeof value !== "number") continue;
    if (param.unit === "levels") {
      // Each halving of the size takes one pyramid level away.
      const shifted = Math.round(value + Math.log2(scale));
      out[param.key] = Math.min(param.max ?? Infinity, Math.max(param.min ?? -Infinity, shifted));
      continue;
    }
    if (param.unit !== "px" && param.unit !== "cycles/px") continue;
    let scaled = param.unit === "px" ? value * scale : value / scale;
    if (param.type === "integer") {
      scaled = Math.round(scaled);
      if (param.oddOnly && scaled % 2 === 0) scaled += 1;
    }
    out[param.key] = Math.min(param.max ?? Infinity, Math.max(param.min ?? -Infinity, scaled));
  }
  return out;
}

// Scheduler ------------------------------------------------------------------------------------

const proxies = new WeakMap<RgbaImage, Map<string, Promise<RgbaImage>>>();

function proxyOf(image: RgbaImage, width: number, height: number): Promise<RgbaImage> {
  let byKey = proxies.get(image);
  if (!byKey) {
    byKey = new Map();
    proxies.set(image, byKey);
  }
  const key = `${width}x${height}`;
  let proxy = byKey.get(key);
  if (!proxy) {
    proxy = resizeImage(image, width, height);
    byKey.set(key, proxy);
  }
  return proxy;
}

const cache = new WeakMap<RgbaImage, Map<string, PreviewState>>();
const CACHE_PER_IMAGE = 8;

function remember(image: RgbaImage, key: string, preview: PreviewState): void {
  let byKey = cache.get(image);
  if (!byKey) {
    byKey = new Map();
    cache.set(image, byKey);
  }
  byKey.delete(key);
  byKey.set(key, preview);
  while (byKey.size > CACHE_PER_IMAGE) byKey.delete(byKey.keys().next().value as string);
}

/** A number per guide image, so the preview cache notices when the guide changes. */
const tokens = new WeakMap<RgbaImage, number>();
let nextToken = 1;
function imageToken(image: RgbaImage): number {
  let token = tokens.get(image);
  if (token === undefined) {
    token = nextToken++;
    tokens.set(image, token);
  }
  return token;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;
let lastKey = "";

function clear(): void {
  controller?.abort();
  controller = null;
  lastKey = "";
  if (useFilters.getState().preview.status !== "off") useFilters.getState().setPreview(NO_PREVIEW);
}

async function update(): Promise<void> {
  const { selectedId, previewOn, applying } = useFilters.getState();
  const entry = filterById(selectedId);
  const doc = activeDocument();
  if (
    !previewOn ||
    applying ||
    !entry ||
    !doc ||
    !isRunnable(entry) ||
    entry.engine !== "browser" ||
    entry.command !== undefined
  ) {
    clear();
    return;
  }
  const { values } = filterValues(entry);
  const normalizes = values.outputMapping === "normalize";
  const plan = planPreview(doc.current, doc.view, useUi.getState().viewportSize, normalizes);
  const guide = guideImageFor(entry, values, doc);
  const key = JSON.stringify([
    doc.id,
    entry.id,
    values,
    plan.region,
    plan.scale,
    guide ? imageToken(guide) : 0,
  ]);
  if (key === lastKey) return;
  lastKey = key;
  const cached = cache.get(doc.current)?.get(key);
  if (cached) {
    controller?.abort();
    useFilters.getState().setPreview(cached);
    return;
  }
  controller?.abort();
  const mine = new AbortController();
  controller = mine;
  const current = useFilters.getState().preview;
  useFilters.getState().setPreview({ ...current, status: "running" });
  try {
    const source =
      plan.scale < 1
        ? await proxyOf(doc.current, plan.region.width, plan.region.height)
        : doc.current;
    if (mine.signal.aborted) return;
    const jobValues = plan.scale < 1 ? scaleParams(entry, values, plan.scale) : values;
    const jobGuide =
      guide && plan.scale < 1 ? await proxyOf(guide, plan.region.width, plan.region.height) : guide;
    if (mine.signal.aborted) return;
    const result = await runJob(
      {
        filterId: entry.id,
        values: jobValues,
        image: source,
        region: plan.region,
        ...(jobGuide ? { guide: jobGuide } : {}),
      },
      { signal: mine.signal },
    );
    if (mine.signal.aborted) return;
    const region =
      plan.scale < 1
        ? { x: 0, y: 0, width: doc.current.width, height: doc.current.height }
        : plan.region;
    const preview: PreviewState = {
      status: "ready",
      documentId: doc.id,
      source: doc.current,
      result: result.image,
      region,
      scale: plan.scale,
      approximate: plan.approximate,
      note: plan.note,
      warnings: result.warnings,
    };
    remember(doc.current, key, preview);
    useFilters.getState().setPreview(preview);
    useFilters
      .getState()
      .setLastRun(entry.id, { kind: "preview", ...result.timing, at: Date.now() });
  } catch (error) {
    if (mine.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
    lastKey = "";
    useFilters.getState().setPreview({
      ...NO_PREVIEW,
      status: "error",
      note: error instanceof Error ? error.message : "The preview failed.",
    });
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void update();
  }, DEBOUNCE_MS);
}

/** Watch the stores and keep the preview up to date. Returns a function that stops it. */
export function startPreview(): () => void {
  const stops = [
    useFilters.subscribe((state, previous) => {
      if (
        state.selectedId !== previous.selectedId ||
        state.values !== previous.values ||
        state.previewOn !== previous.previewOn ||
        state.applying !== previous.applying
      ) {
        schedule();
      }
    }),
    useDocuments.subscribe((state, previous) => {
      const now = activeDocument(state);
      const before = activeDocument(previous);
      if (
        now?.id !== before?.id ||
        now?.current !== before?.current ||
        now?.view !== before?.view
      ) {
        schedule();
      }
    }),
    useUi.subscribe((state, previous) => {
      if (state.viewportSize !== previous.viewportSize) schedule();
    }),
  ];
  schedule();
  return () => {
    stops.forEach((stop) => stop());
    if (timer) clearTimeout(timer);
    clear();
  };
}
