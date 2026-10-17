/** Metrics worker: PSNR, SSIM, MSE and MAE off the main thread, since SSIM on a large image takes seconds. */
import { qualityMetrics } from "@/core/metrics/quality";

import type { MetricsRequest, MetricsResponse } from "./metrics-protocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<MetricsRequest>) => void) | null;
  postMessage(message: MetricsResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<MetricsRequest>) => {
  const { id, width, height, image, reference, mask } = event.data;
  try {
    const metrics = qualityMetrics(
      { width, height, data: new Uint8ClampedArray(image) },
      { width, height, data: new Uint8ClampedArray(reference) },
      mask ? { width, height, data: new Uint8Array(mask) } : undefined,
    );
    scope.postMessage({ id, ok: true, metrics });
  } catch (error) {
    scope.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : "The metrics could not be computed.",
    });
  }
};
