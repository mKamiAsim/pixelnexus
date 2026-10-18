import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";

import type { SubjectRequest, SubjectResponse } from "./subject-protocol";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { width: number; height: number; resolve: (m: Mask) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./subject.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<SubjectResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok)
      entry.resolve({ width: entry.width, height: entry.height, data: response.mask });
    else entry.reject(new Error(response.message));
  };
  return worker;
}

/** The subject mask of an image, made in a worker. The image is copied. */
export function subjectInWorker(image: RgbaImage): Promise<Mask> {
  const id = nextId++;
  const buffer = image.data.slice().buffer;
  return new Promise((resolve, reject) => {
    pending.set(id, { width: image.width, height: image.height, resolve, reject });
    const request: SubjectRequest = { id, width: image.width, height: image.height, buffer };
    getWorker().postMessage(request, [buffer]);
  });
}
