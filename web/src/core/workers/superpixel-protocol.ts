/** Messages between the studio and the superpixel worker. */
export interface SuperpixelRequest {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  /** RGBA bytes, transferred. */
  readonly buffer: ArrayBuffer;
  readonly step: number;
  readonly compactness: number;
}

export type SuperpixelResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly count: number;
      readonly labels: Int32Array;
      readonly size: Int32Array;
      readonly color: Float32Array;
      readonly texture: Float32Array;
      readonly start: Int32Array;
      readonly adjacent: Int32Array;
      readonly edge: Float32Array;
    }
  | { readonly id: number; readonly ok: false; readonly message: string };
