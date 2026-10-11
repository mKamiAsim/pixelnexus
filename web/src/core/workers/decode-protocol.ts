import type { DecodePath } from "@/core/image/decode";
import type { ImageHeader } from "@/core/image/format";
import type { ImageLimits, LoadIssue } from "@/core/image/limits";

export interface DecodeRequest {
  readonly id: number;
  readonly buffer: ArrayBuffer;
  readonly limits: ImageLimits;
}

export type DecodeResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly width: number;
      readonly height: number;
      readonly buffer: ArrayBuffer;
      readonly header: ImageHeader;
      readonly issues: readonly LoadIssue[];
      readonly path: DecodePath;
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly message: string;
      readonly issues: readonly LoadIssue[];
    };
