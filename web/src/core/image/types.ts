/**
 * An 8-bit RGBA image. Values are sRGB encoded. Alpha is straight, not premultiplied.
 * Pixels are stored row by row from the top left, four bytes per pixel, with no padding.
 * The shape matches the browser's ImageData, so either can be passed where the other is expected.
 */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

function assertSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Image size must be positive integers, got ${width}x${height}.`);
  }
}

/** Create a transparent black image. */
export function createImage(width: number, height: number): RgbaImage {
  assertSize(width, height);
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Create an opaque gray image from one value per pixel. Values are rounded and clamped. */
export function fromGray(width: number, height: number, values: ArrayLike<number>): RgbaImage {
  assertSize(width, height);
  if (values.length !== width * height) {
    throw new RangeError(`Expected ${width * height} values, got ${values.length}.`);
  }
  const image = createImage(width, height);
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    const o = i * 4;
    image.data[o] = v;
    image.data[o + 1] = v;
    image.data[o + 2] = v;
    image.data[o + 3] = 255;
  }
  return image;
}

/** Read one channel of one pixel. Channel 0 is red, 3 is alpha. */
export function getChannel(image: RgbaImage, x: number, y: number, channel: number): number {
  return image.data[(y * image.width + x) * 4 + channel] ?? 0;
}
