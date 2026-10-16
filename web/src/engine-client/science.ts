/**
 * The client for the PixelNexus science engine, a local Python server (PLAN.md section 3.8).
 *
 * A job uploads the image once as raw RGBA (the engine names it by its content hash), starts the
 * filter, follows its progress through server-sent events, and fetches the result as raw RGBA.
 * An abort cancels the job on the engine, which stops its process. Science filters work on the
 * whole image, so a region is cut out of the result. A selection that the filter reads goes up
 * as a gray image, and the job names it as its mask. A result of another size than the image,
 * such as an enlargement, comes back whole. Feature detectors send a table as JSON, and the
 * image stays as it was.
 */
import { decodeLabels, isLabelResult, paintLabels } from "@/core/features/labels";
import { isFeatureTable } from "@/core/features/table";
import { fullRect } from "@/core/filters/run";
import type { Params, Representation } from "@/core/filters/types";
import { AbortedError } from "@/core/workers/pool";
import type { RgbaImage } from "@/core/image/types";
import { maskToImage, type Mask } from "@/core/mask/mask";

import {
  EngineError,
  type EngineClient,
  type FilterJob,
  type JobOptions,
  type JobResult,
} from "./types";

export const DEFAULT_ENGINE_URL = "http://127.0.0.1:8765";

export const OFFLINE_MESSAGE =
  "The PixelNexus engine is not running on this computer. Start it with: uv run pixelnexus-engine";

interface JobStatus {
  readonly id: string;
  readonly state: "queued" | "running" | "done" | "failed" | "cancelled";
  readonly progress: number;
  readonly error: string | null;
}

const TERMINAL = new Set(["done", "failed", "cancelled"]);

/** The engine's answer for an image id it does not hold ends with these words. */
const IMAGE_GONE = "Upload it again";

/** Cut a region out of an image. */
export function cropImage(
  image: RgbaImage,
  region: { x: number; y: number; width: number; height: number },
): RgbaImage {
  const data = new Uint8ClampedArray(region.width * region.height * 4);
  for (let row = 0; row < region.height; row++) {
    const from = ((region.y + row) * image.width + region.x) * 4;
    data.set(image.data.subarray(from, from + region.width * 4), row * region.width * 4);
  }
  return { width: region.width, height: region.height, data };
}

/** An optional model as the engine reports it. */
export interface ModelStatus {
  readonly id: string;
  readonly name: string;
  readonly sizeMB: number;
  /** All files of the model together. */
  readonly totalMB?: number;
  readonly license: string;
  readonly licenseUrl?: string;
  readonly downloaded: boolean;
  /** A download that runs or failed. */
  readonly download?: {
    readonly state: "downloading" | "failed";
    readonly done: number;
    readonly total: number;
    readonly error?: string;
  };
}

/** The model runtime of the engine and the device it chose (Phase 7c). */
export interface InferenceInfo {
  readonly runtime: string | null;
  readonly preference: string;
  readonly device: "cuda" | "cpu" | "none";
  readonly providers: readonly string[];
  readonly note: string;
}

export interface EngineInfo {
  readonly version: string;
  /** Null for a few seconds after the engine starts, while it checks the device. */
  readonly inference?: InferenceInfo | null;
}

export class ScienceEngine implements EngineClient {
  readonly name = "science";
  private readonly uploads = new WeakMap<RgbaImage, Promise<string>>();
  private readonly masks = new WeakMap<Mask, RgbaImage>();

  constructor(readonly baseUrl: string = DEFAULT_ENGINE_URL) {}

  url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  /** Fetch, turning network failures and error answers into messages for the user. */
  async call(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(this.url(path), init);
    } catch {
      throw new EngineError(OFFLINE_MESSAGE);
    }
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body: { detail?: unknown }) => body.detail)
        .catch(() => null);
      throw new EngineError(
        typeof detail === "string" ? detail : `The engine answered with error ${response.status}.`,
        response.status,
      );
    }
    return response;
  }

  /** Upload an image once per image object. The engine returns its content hash. */
  upload(image: RgbaImage): Promise<string> {
    const known = this.uploads.get(image);
    if (known) return known;
    const query = `?width=${image.width}&height=${image.height}`;
    const pending = this.call(`/images${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: image.data,
    })
      .then((response) => response.json())
      .then((body: { id: string }) => body.id);
    pending.catch(() => this.uploads.delete(image));
    this.uploads.set(image, pending);
    return pending;
  }

  async run(job: FilterJob, options: JobOptions = {}): Promise<JobResult> {
    const started = performance.now();
    if (options.signal?.aborted) throw new AbortedError();
    const created = await this.start(job).catch((error: unknown) => {
      // The engine drops the image used least recently when its cache is full. Upload it again.
      const gone = error instanceof EngineError && error.status === 404;
      if (!gone || !error.message.includes(IMAGE_GONE)) throw error;
      this.uploads.delete(job.image);
      if (job.hole) this.uploads.delete(this.maskImage(job.hole));
      return this.start(job);
    });
    const { id } = (await created.json()) as JobStatus;
    const cancel = () => {
      void fetch(this.url(`/jobs/${id}`), { method: "DELETE" }).catch(() => undefined);
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const status = await this.follow(id, options);
      if (status.state === "cancelled") throw new AbortedError();
      if (status.state === "failed") throw new EngineError(status.error ?? "The job failed.");
      const response = await this.call(`/jobs/${id}/result`);
      if (response.headers.get("content-type")?.includes("application/json")) {
        const body: unknown = await response.json();
        const region = job.region ?? fullRect(job.image);
        const totalMs = performance.now() - started;
        const timing = { totalMs, computeMs: totalMs, tiles: 1, workers: 1 };
        if (isLabelResult(body)) {
          const labels = decodeLabels(body);
          if (labels.width !== job.image.width || labels.height !== job.image.height)
            throw new EngineError("The engine sent a label map of another size.");
          const painted = paintLabels(labels);
          return {
            region,
            image: cropImage(painted, region),
            warnings: [],
            timing,
            features: body.table,
            labels,
          };
        }
        if (!isFeatureTable(body))
          throw new EngineError("The engine sent a result of unknown kind.");
        return {
          region,
          image: cropImage(job.image, region),
          warnings: [],
          timing,
          features: body,
        };
      }
      const width = Number(response.headers.get("X-Width"));
      const height = Number(response.headers.get("X-Height"));
      const whole: RgbaImage = {
        width,
        height,
        data: new Uint8ClampedArray(await response.arrayBuffer()),
      };
      const resized = width !== job.image.width || height !== job.image.height;
      const region = job.region && !resized ? job.region : { x: 0, y: 0, width, height };
      const same =
        region.x === 0 && region.y === 0 && region.width === width && region.height === height;
      const totalMs = performance.now() - started;
      return {
        region,
        image: same ? whole : cropImage(whole, region),
        warnings: [],
        timing: { totalMs, computeMs: totalMs, tiles: 1, workers: 1 },
      };
    } finally {
      options.signal?.removeEventListener("abort", cancel);
    }
  }

  /**
   * Run an AI task of catalog/ai-tasks.yaml with an engine model, for the AI router's engine
   * model provider. Returns the result image: for a mask task, a gray image of the mask.
   */
  async aiTask(
    taskId: string,
    request: {
      readonly image: RgbaImage;
      readonly model?: string;
      readonly points?: readonly { x: number; y: number; positive: boolean }[];
      readonly box?: { x: number; y: number; width: number; height: number };
    },
    signal?: AbortSignal,
  ): Promise<RgbaImage> {
    if (signal?.aborted) throw new AbortedError();
    const image = await this.upload(request.image);
    const created = await this.call(`/ai/${encodeURIComponent(taskId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        ...(request.model ? { model: request.model } : {}),
        points: request.points ?? [],
        ...(request.box ? { box: request.box } : {}),
      }),
    });
    const { id } = (await created.json()) as JobStatus;
    const cancel = () => {
      void fetch(this.url(`/jobs/${id}`), { method: "DELETE" }).catch(() => undefined);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const status = await this.follow(id, signal ? { signal } : {});
      if (status.state === "cancelled") throw new AbortedError();
      if (status.state === "failed") throw new EngineError(status.error ?? "The job failed.");
      const response = await this.call(`/jobs/${id}/result`);
      return {
        width: Number(response.headers.get("X-Width")),
        height: Number(response.headers.get("X-Height")),
        data: new Uint8ClampedArray(await response.arrayBuffer()),
      };
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  /** The gray picture of a mask that goes to the engine, made once per mask. */
  private maskImage(mask: Mask): RgbaImage {
    let image = this.masks.get(mask);
    if (!image) {
      image = maskToImage(mask);
      this.masks.set(mask, image);
    }
    return image;
  }

  /** Upload the image, and the selection the filter reads, if needed and start the job. */
  private async start(job: FilterJob): Promise<Response> {
    const image = await this.upload(job.image);
    const mask = job.hole ? await this.upload(this.maskImage(job.hole)) : undefined;
    return this.call("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: job.filterId,
        image,
        params: job.params,
        ...(mask ? { mask } : {}),
      }),
    });
  }

  /** Follow the job's event stream until it ends. Falls back to one status read on errors. */
  private follow(id: string, options: JobOptions): Promise<JobStatus> {
    return new Promise((resolve, reject) => {
      const events = new EventSource(this.url(`/jobs/${id}/events`));
      const stop = () => {
        events.close();
        options.signal?.removeEventListener("abort", abort);
      };
      const abort = () => {
        stop();
        reject(new AbortedError());
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      events.addEventListener("status", (event) => {
        const status = JSON.parse((event as MessageEvent<string>).data) as JobStatus;
        options.onProgress?.(status.progress);
        if (TERMINAL.has(status.state)) {
          stop();
          resolve(status);
        }
      });
      events.onerror = () => {
        stop();
        this.call(`/jobs/${id}`)
          .then((response) => response.json() as Promise<JobStatus>)
          .then((status) =>
            TERMINAL.has(status.state)
              ? resolve(status)
              : reject(new EngineError("The connection to the engine broke during the job.")),
          )
          .catch(reject);
      };
    });
  }

  /** The operator for the Inspector, built by the same engine code that runs the filter. */
  async representation(
    filterId: string,
    params: Params,
    signal?: AbortSignal,
  ): Promise<Representation> {
    const response = await this.call(`/filters/${encodeURIComponent(filterId)}/representation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      ...(signal ? { signal } : {}),
    });
    return (await response.json()) as Representation;
  }

  /** The optional models the engine knows, and whether each is downloaded. */
  async models(): Promise<ModelStatus[]> {
    const response = await this.call("/models");
    return (await response.json()) as ModelStatus[];
  }

  async model(modelId: string): Promise<ModelStatus> {
    const response = await this.call(`/models/${encodeURIComponent(modelId)}`);
    return (await response.json()) as ModelStatus;
  }

  /**
   * Download one model to the engine's models folder, and wait until every file is checked.
   * Call this only from a click on Download model, after the studio has shown the size and
   * license. `onProgress` gets the share done, from 0 to 1.
   */
  async downloadModel(
    modelId: string,
    onProgress?: (share: number) => void,
    pollMs = 500,
  ): Promise<ModelStatus> {
    const path = `/models/${encodeURIComponent(modelId)}`;
    let status = (await (
      await this.call(`${path}/download`, { method: "POST" })
    ).json()) as ModelStatus;
    while (!status.downloaded) {
      const progress = status.download;
      if (!progress) throw new EngineError("The download stopped without an answer.");
      if (progress.state === "failed")
        throw new EngineError(progress.error ?? "The download failed.");
      onProgress?.(progress.total > 0 ? progress.done / progress.total : 0);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      status = await this.model(modelId);
    }
    onProgress?.(1);
    return status;
  }

  /** Remove a downloaded model from the engine's models folder. */
  async deleteModel(modelId: string): Promise<ModelStatus> {
    const response = await this.call(`/models/${encodeURIComponent(modelId)}`, {
      method: "DELETE",
    });
    return (await response.json()) as ModelStatus;
  }

  /** Engine version and limits, or null when no engine answers. */
  async info(timeoutMs = 1500): Promise<EngineInfo | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.url("/info"), { signal: controller.signal });
      return response.ok ? ((await response.json()) as EngineInfo) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
