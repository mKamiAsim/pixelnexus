/** Superpixel worker: SLIC and the superpixel facts for Quick Selection, off the main thread. */
import { superpixels } from "@/core/selection/slic";

import type { SuperpixelRequest, SuperpixelResponse } from "./superpixel-protocol";

/** The parts of the worker global scope this file uses. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<SuperpixelRequest>) => void) | null;
  postMessage(message: SuperpixelResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SuperpixelRequest>) => {
  const { id, width, height, buffer, step, compactness } = event.data;
  try {
    const image = { width, height, data: new Uint8ClampedArray(buffer) };
    const sp = superpixels(image, step, compactness);
    const arrays = [sp.labels, sp.size, sp.color, sp.texture, sp.start, sp.adjacent, sp.edge];
    scope.postMessage(
      {
        id,
        ok: true,
        count: sp.count,
        labels: sp.labels,
        size: sp.size,
        color: sp.color,
        texture: sp.texture,
        start: sp.start,
        adjacent: sp.adjacent,
        edge: sp.edge,
      },
      arrays.map((a) => a.buffer),
    );
  } catch (error) {
    scope.postMessage(
      { id, ok: false, message: error instanceof Error ? error.message : "Superpixels failed." },
      [],
    );
  }
};
