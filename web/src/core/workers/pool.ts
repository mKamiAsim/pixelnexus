/**
 * A pool of filter workers. A job is a list of tiles. Each tile's input is built only when a
 * worker is free, so only a few padded tiles exist at a time.
 *
 * Cancelling a job drops its waiting tiles and replaces any worker that is still busy with it,
 * so a long tile cannot hold the pool.
 */
import type { TileRequest, TileResponse } from "./filter-protocol";

/** Builds one tile request when a worker is ready for it. The pool fills in the ids. */
export type TileTask = () => Omit<TileRequest, "jobId" | "tileId">;

export type TileResult = Extract<TileResponse, { type: "tile-done" | "tile-stats" }>;

interface Job {
  readonly id: number;
  readonly tasks: TileTask[];
  next: number;
  done: number;
  readonly results: TileResult[];
  readonly onTile?: (result: TileResult, done: number, total: number) => void;
  readonly resolve: (results: TileResult[]) => void;
  readonly reject: (error: Error) => void;
}

interface Slot {
  worker: Worker;
  job: number | null;
}

export class AbortedError extends Error {
  override name = "AbortError";
  constructor() {
    super("The job was cancelled.");
  }
}

export function defaultPoolSize(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(8, cores - 1));
}

export class WorkerPool {
  private readonly slots: Slot[] = [];
  private readonly jobs = new Map<number, Job>();
  private nextJob = 1;

  constructor(
    readonly size: number = defaultPoolSize(),
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL("./filter.worker.ts", import.meta.url), { type: "module" }),
  ) {}

  /** Run tiles and resolve with their results in tile order. */
  run(
    tasks: TileTask[],
    options: {
      signal?: AbortSignal;
      onTile?: (result: TileResult, done: number, total: number) => void;
    } = {},
  ): Promise<TileResult[]> {
    const id = this.nextJob++;
    return new Promise<TileResult[]>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new AbortedError());
        return;
      }
      if (tasks.length === 0) {
        resolve([]);
        return;
      }
      this.jobs.set(id, {
        id,
        tasks,
        next: 0,
        done: 0,
        results: new Array<TileResult>(tasks.length),
        onTile: options.onTile,
        resolve,
        reject,
      });
      options.signal?.addEventListener("abort", () => this.cancel(id, new AbortedError()), {
        once: true,
      });
      this.dispatch();
    });
  }

  /** Stop a job. Its promise rejects with the given error. */
  cancel(jobId: number, error: Error = new AbortedError()): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.delete(jobId);
    for (const slot of this.slots) {
      if (slot.job === jobId) this.replace(slot);
    }
    job.reject(error);
    this.dispatch();
  }

  dispose(): void {
    for (const id of [...this.jobs.keys()]) this.cancel(id);
    for (const slot of this.slots) slot.worker.terminate();
    this.slots.length = 0;
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.createWorker(), job: null };
    this.listen(slot);
    return slot;
  }

  private listen(slot: Slot): void {
    slot.worker.onmessage = (event: MessageEvent<TileResponse>) => this.receive(slot, event.data);
    slot.worker.onerror = (event) => {
      event.preventDefault();
      const jobId = slot.job;
      this.replace(slot);
      if (jobId !== null) {
        this.cancel(jobId, new Error(event.message || "A filter worker stopped unexpectedly."));
      }
    };
  }

  private replace(slot: Slot): void {
    slot.worker.terminate();
    slot.worker = this.createWorker();
    slot.job = null;
    this.listen(slot);
  }

  private receive(slot: Slot, response: TileResponse): void {
    slot.job = null;
    const job = this.jobs.get(response.jobId);
    if (job) {
      if (response.type === "tile-error") {
        this.cancel(job.id, new Error(response.message));
        return;
      }
      job.results[response.tileId] = response;
      job.done++;
      job.onTile?.(response, job.done, job.tasks.length);
      if (job.done === job.tasks.length) {
        this.jobs.delete(job.id);
        job.resolve(job.results);
      }
    }
    this.dispatch();
  }

  private dispatch(): void {
    while (this.slots.length < this.size && this.pendingTiles() > this.idleSlots()) {
      this.slots.push(this.spawn());
    }
    for (const slot of this.slots) {
      if (slot.job !== null) continue;
      const job = [...this.jobs.values()].find((j) => j.next < j.tasks.length);
      if (!job) return;
      const tileId = job.next++;
      const task = job.tasks[tileId];
      if (!task) continue;
      let request: TileRequest;
      try {
        request = { ...task(), jobId: job.id, tileId };
      } catch (error) {
        this.cancel(job.id, error instanceof Error ? error : new Error(String(error)));
        return;
      }
      slot.job = job.id;
      const transfer = request.guideBuffer
        ? [request.buffer, request.guideBuffer]
        : [request.buffer];
      slot.worker.postMessage(request, transfer);
    }
  }

  private pendingTiles(): number {
    let count = 0;
    for (const job of this.jobs.values()) count += job.tasks.length - job.next;
    return count;
  }

  private idleSlots(): number {
    return this.slots.filter((slot) => slot.job === null).length;
  }
}
