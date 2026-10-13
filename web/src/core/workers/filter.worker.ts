/**
 * Filter worker. It runs one tile at a time: process the padded tile, cut the halo off, then
 * either report the value range (first pass of the normalize mapping) or return 8-bit pixels.
 */
import { browserFilter } from "@/core/filters/registry";
import { cropProcessed, processImage, toBytes, valueRange } from "@/core/filters/run";

import type { TileRequest, TileResponse } from "./filter-protocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<TileRequest>) => void) | null;
  postMessage(message: TileResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<TileRequest>) => {
  const request = event.data;
  const { jobId, tileId } = request;
  const started = performance.now();
  try {
    const filter = browserFilter(request.filterId);
    if (!filter) throw new Error(`The browser engine has no filter "${request.filterId}".`);
    const padded = {
      width: request.width,
      height: request.height,
      data: new Uint8ClampedArray(request.buffer),
    };
    const processed = processImage(padded, filter, request.params, {
      originX: request.core.x - request.halo,
      originY: request.core.y - request.halo,
      transparent: request.transparent,
      ...(request.guideBuffer
        ? {
            guide: {
              width: request.width,
              height: request.height,
              data: new Uint8ClampedArray(request.guideBuffer),
            },
          }
        : {}),
    });
    const core =
      request.halo === 0
        ? processed
        : cropProcessed(processed, {
            x: request.halo,
            y: request.halo,
            width: request.core.width,
            height: request.core.height,
          });
    if (request.statsOnly) {
      scope.postMessage({
        type: "tile-stats",
        jobId,
        tileId,
        range: valueRange(core),
        derived: core.derived,
        ms: performance.now() - started,
      });
      return;
    }
    const bytes = toBytes(core, request.mapping, request.range);
    scope.postMessage(
      {
        type: "tile-done",
        jobId,
        tileId,
        buffer: bytes.data.buffer,
        warnings: core.warnings,
        ms: performance.now() - started,
      },
      [bytes.data.buffer],
    );
  } catch (error) {
    scope.postMessage({
      type: "tile-error",
      jobId,
      tileId,
      message: error instanceof Error ? error.message : "The filter failed.",
    });
  }
};
