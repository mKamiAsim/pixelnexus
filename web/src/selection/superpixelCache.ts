/**
 * Superpixels for Quick Selection, made once per image in a worker. Large images use a copy of
 * at most WORK_PIXELS pixels, so the work stays under about a second. The selection is then
 * scaled up to the image size.
 */
import { useEffect, useSyncExternalStore } from "react";

import { resizeImage } from "@/core/image/resize";
import type { RgbaImage } from "@/core/image/types";
import { stepFor, type Superpixels } from "@/core/selection/slic";
import { superpixelsInWorker } from "@/core/workers/superpixel-client";

export const WORK_PIXELS = 2_000_000;
/** SLIC compactness m. 10 is the value the SLIC paper uses for CIELAB. */
export const COMPACTNESS = 10;

export interface PreparedSuperpixels {
  readonly sp: Superpixels;
  /** Superpixel-map pixels per image pixel, across and down. */
  readonly sx: number;
  readonly sy: number;
}

export type SuperpixelState =
  | { readonly status: "preparing" }
  | { readonly status: "ready"; readonly value: PreparedSuperpixels }
  | { readonly status: "error"; readonly message: string };

const entries = new WeakMap<RgbaImage, SuperpixelState>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Start making the superpixels of an image, unless they exist or are on the way. */
export function prepareSuperpixels(image: RgbaImage): void {
  if (entries.has(image)) return;
  entries.set(image, { status: "preparing" });
  changed();
  void (async () => {
    try {
      const scale = Math.min(1, Math.sqrt(WORK_PIXELS / (image.width * image.height)));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const work = scale < 1 ? await resizeImage(image, width, height) : image;
      const sp = await superpixelsInWorker(work, stepFor(width, height), COMPACTNESS);
      entries.set(image, {
        status: "ready",
        value: { sp, sx: width / image.width, sy: height / image.height },
      });
    } catch (error) {
      entries.set(image, {
        status: "error",
        message: error instanceof Error ? error.message : "The superpixels could not be made.",
      });
    }
    changed();
  })();
}

export function readySuperpixels(image: RgbaImage): PreparedSuperpixels | null {
  const entry = entries.get(image);
  return entry?.status === "ready" ? entry.value : null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The superpixel state of an image. Asking starts the work. */
export function useSuperpixels(image: RgbaImage | null): SuperpixelState | null {
  useEffect(() => {
    if (image) prepareSuperpixels(image);
  }, [image]);
  return useSyncExternalStore(subscribe, () => (image ? (entries.get(image) ?? null) : null));
}
