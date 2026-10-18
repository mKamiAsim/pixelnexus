/** Messages between the studio and the subject worker. */
export interface SubjectRequest {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  /** RGBA bytes, transferred. */
  readonly buffer: ArrayBuffer;
}

export type SubjectResponse =
  | { readonly id: number; readonly ok: true; readonly mask: Uint8Array }
  | { readonly id: number; readonly ok: false; readonly message: string };
