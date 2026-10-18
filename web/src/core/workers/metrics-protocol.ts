/** Messages between the studio and the metrics worker. */
import type { QualityMetrics } from "@/core/metrics/quality";

export interface MetricsRequest {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  /** RGBA bytes of the image and the reference, and the mask bytes or null, transferred. */
  readonly image: ArrayBuffer;
  readonly reference: ArrayBuffer;
  readonly mask: ArrayBuffer | null;
}

export type MetricsResponse =
  | { readonly id: number; readonly ok: true; readonly metrics: QualityMetrics }
  | { readonly id: number; readonly ok: false; readonly message: string };
