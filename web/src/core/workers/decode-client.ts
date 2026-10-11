import type { DecodePath } from "@/core/image/decode";
import type { ImageHeader } from "@/core/image/format";
import { DEFAULT_LIMITS, type ImageLimits, type LoadIssue } from "@/core/image/limits";
import type { RgbaImage } from "@/core/image/types";

import type { DecodeRequest, DecodeResponse } from "./decode-protocol";

export interface DecodedImage {
  readonly image: RgbaImage;
  readonly header: ImageHeader;
  /** Warnings about what decoding changed. */
  readonly warnings: readonly LoadIssue[];
  readonly path: DecodePath;
}

/** Raised when a file cannot be opened. The message is written for the person using the app. */
export class ImageLoadError extends Error {
  override name = "ImageLoadError";
  constructor(
    message: string,
    readonly issues: readonly LoadIssue[],
  ) {
    super(message);
  }
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (d: DecodedImage) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) {
      entry.resolve({
        image: {
          width: response.width,
          height: response.height,
          data: new Uint8ClampedArray(response.buffer),
        },
        header: response.header,
        warnings: response.issues.filter((issue) => issue.level === "warning"),
        path: response.path,
      });
    } else {
      entry.reject(new ImageLoadError(response.message, response.issues));
    }
  };
  return worker;
}

/**
 * Decode image bytes in a worker. The buffer is transferred, so it is empty afterwards.
 * Rejects with ImageLoadError for unsupported, damaged or oversized files.
 */
export function decodeInWorker(
  buffer: ArrayBuffer,
  limits: ImageLimits = DEFAULT_LIMITS,
): Promise<DecodedImage> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: DecodeRequest = { id, buffer, limits };
    getWorker().postMessage(request, [buffer]);
  });
}
