/** Messages between the worker pool and filter.worker.ts. Buffers are transferred, not copied. */
import type { Rect, ValueRange } from "@/core/filters/run";
import type { OutputMapping, Params } from "@/core/filters/types";

export interface TileRequest {
  readonly type: "tile";
  readonly jobId: number;
  readonly tileId: number;
  readonly filterId: string;
  readonly params: Params;
  /** The tile plus its halo, as RGBA bytes. */
  readonly width: number;
  readonly height: number;
  readonly buffer: ArrayBuffer;
  readonly halo: number;
  /** The tile without its halo, in image coordinates. */
  readonly core: Rect;
  /** True when the whole source image has transparency. See ProcessOptions in run.ts. */
  readonly transparent: boolean;
  readonly mapping: OutputMapping;
  /** For the normalize mapping: the value range of the whole result. */
  readonly range?: ValueRange;
  /** Return only the value range, for the first pass of the normalize mapping. */
  readonly statsOnly: boolean;
}

export type TileResponse =
  | {
      readonly type: "tile-done";
      readonly jobId: number;
      readonly tileId: number;
      /** RGBA bytes of the core rectangle. */
      readonly buffer: ArrayBuffer;
      readonly warnings: readonly string[];
      readonly ms: number;
    }
  | {
      readonly type: "tile-stats";
      readonly jobId: number;
      readonly tileId: number;
      readonly range: ValueRange;
      readonly derived: boolean;
      readonly ms: number;
    }
  | {
      readonly type: "tile-error";
      readonly jobId: number;
      readonly tileId: number;
      readonly message: string;
    };
