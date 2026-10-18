import type { RgbaImage } from "@/core/image/types";
import type { Superpixels } from "@/core/selection/slic";

import type { SuperpixelRequest, SuperpixelResponse } from "./superpixel-protocol";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { width: number; height: number; resolve: (s: Superpixels) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./superpixel.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<SuperpixelResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (!response.ok) {
      entry.reject(new Error(response.message));
      return;
    }
    const { id: _id, ok: _ok, ...facts } = response;
    entry.resolve({ width: entry.width, height: entry.height, ...facts });
  };
  return worker;
}

/** Compute superpixels in a worker. The image is copied, so it stays usable here. */
export function superpixelsInWorker(
  image: RgbaImage,
  step: number,
  compactness: number,
): Promise<Superpixels> {
  const id = nextId++;
  const buffer = image.data.slice().buffer;
  return new Promise((resolve, reject) => {
    pending.set(id, { width: image.width, height: image.height, resolve, reject });
    const request: SuperpixelRequest = {
      id,
      width: image.width,
      height: image.height,
      buffer,
      step,
      compactness,
    };
    getWorker().postMessage(request, [buffer]);
  });
}
