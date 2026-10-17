/**
 * Quality metrics in a worker, cached per image, reference and mask. The same pair asked twice
 * shares one computation. In an environment without workers, such as unit tests, they run here.
 */
import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";
import { qualityMetrics, type QualityMetrics } from "@/core/metrics/quality";

import type { MetricsRequest, MetricsResponse } from "./metrics-protocol";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (m: QualityMetrics) => void; reject: (e: Error) => void }
>();
const cache = new WeakMap<
  RgbaImage,
  WeakMap<RgbaImage, Map<Mask | null, Promise<QualityMetrics>>>
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./metrics.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<MetricsResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.metrics);
    else entry.reject(new Error(response.message));
  };
  return worker;
}

function compute(
  image: RgbaImage,
  reference: RgbaImage,
  mask: Mask | null,
): Promise<QualityMetrics> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(qualityMetrics(image, reference, mask ?? undefined));
  }
  const id = nextId++;
  const request: MetricsRequest = {
    id,
    width: image.width,
    height: image.height,
    image: image.data.slice().buffer,
    reference: reference.data.slice().buffer,
    mask: mask ? mask.data.slice().buffer : null,
  };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const transfer = [request.image, request.reference, ...(request.mask ? [request.mask] : [])];
    getWorker().postMessage(request, transfer);
  });
}

export function metricsInWorker(
  image: RgbaImage,
  reference: RgbaImage,
  mask: Mask | null = null,
): Promise<QualityMetrics> {
  let byReference = cache.get(image);
  if (!byReference) {
    byReference = new WeakMap();
    cache.set(image, byReference);
  }
  let byMask = byReference.get(reference);
  if (!byMask) {
    byMask = new Map();
    byReference.set(reference, byMask);
  }
  let result = byMask.get(mask);
  if (!result) {
    result = compute(image, reference, mask);
    const owner = byMask;
    result.catch(() => owner.delete(mask));
    byMask.set(mask, result);
  }
  return result;
}
