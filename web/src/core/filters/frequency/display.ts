/**
 * The picture of the Spectrum panel: the log magnitude of the windowed spectrum of the image,
 * with frequency 0 in the center, tinted where the selected filter removes frequencies.
 */
import { luma709 } from "@/core/color/convert";
import { createPlane, type Plane } from "@/core/filters/planes";
import { createImage, type RgbaImage } from "@/core/image/types";

import { windowedSpectrum } from "./notch";
import type { Response, Spectrum } from "./spectral";

/** The largest side of the part of the image the panel transforms. */
export const SPECTRUM_SIDE = 512;

/** The tint for removed frequencies. */
const TINT = [229, 72, 77] as const;

export interface SpectrumView {
  /** The luma of the center part of the image, at most SPECTRUM_SIDE on each side. */
  readonly plane: Plane;
  /** True when the image was larger, so the plane is its center part. */
  readonly cropped: boolean;
  readonly spectrum: Spectrum;
  /** ln(1 + |F|) on the FFT grid, in FFT order. */
  readonly log: Float64Array;
  readonly top: number;
}

export function spectrumView(image: RgbaImage): SpectrumView {
  const width = Math.min(image.width, SPECTRUM_SIDE);
  const height = Math.min(image.height, SPECTRUM_SIDE);
  const x0 = (image.width - width) >> 1;
  const y0 = (image.height - height) >> 1;
  const plane = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = ((y + y0) * image.width + x + x0) * 4;
      plane.data[y * width + x] = luma709(
        image.data[o] ?? 0,
        image.data[o + 1] ?? 0,
        image.data[o + 2] ?? 0,
      );
    }
  }
  const spectrum = windowedSpectrum(plane);
  const log = new Float64Array(spectrum.width * spectrum.height);
  let top = 0;
  for (let k = 0; k < log.length; k++) {
    const v = Math.log1p(Math.hypot(spectrum.re[k] ?? 0, spectrum.im[k] ?? 0));
    log[k] = v;
    top = Math.max(top, v);
  }
  return {
    plane,
    cropped: width < image.width || height < image.height,
    spectrum,
    log,
    top: top || 1,
  };
}

/** The frequency at a column and row of the picture, which has frequency 0 in its center. */
export function frequencyAt(
  view: SpectrumView,
  column: number,
  row: number,
): { fx: number; fy: number } {
  const { width, height } = view.spectrum;
  return { fx: (column - (width >> 1)) / width, fy: (row - (height >> 1)) / height };
}

/** The picture position of a frequency, the inverse of frequencyAt. */
export function positionOf(
  view: SpectrumView,
  fx: number,
  fy: number,
): { column: number; row: number } {
  const { width, height } = view.spectrum;
  return { column: fx * width + (width >> 1), row: fy * height + (height >> 1) };
}

/**
 * The brightest picture position within `reach` steps of a column and row, so a click near a
 * peak lands on it. Ties keep the position closest to the click.
 */
export function snapToPeak(
  view: SpectrumView,
  column: number,
  row: number,
  reach = 2,
): { column: number; row: number } {
  const { width, height } = view.spectrum;
  const valueAt = (c: number, r: number) => {
    const i = (c - (width >> 1) + width) % width;
    const j = (r - (height >> 1) + height) % height;
    return view.log[j * width + i] ?? 0;
  };
  let best = { column, row };
  let bestValue = valueAt(column, row);
  let bestDistance = 0;
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const c = column + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= width || r >= height) continue;
      const value = valueAt(c, r);
      const distance = dc * dc + dr * dr;
      if (value > bestValue || (value === bestValue && distance < bestDistance)) {
        best = { column: c, row: r };
        bestValue = value;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * The picture: gray log magnitude, tinted by 1 - |H| where a response removes frequencies. The
 * response is read at the frequency of each pixel.
 */
export function spectrumPicture(view: SpectrumView, response?: Response): RgbaImage {
  const { width, height } = view.spectrum;
  const out = createImage(width, height);
  for (let row = 0; row < height; row++) {
    const j = (row - (height >> 1) + height) % height;
    for (let column = 0; column < width; column++) {
      const i = (column - (width >> 1) + width) % width;
      const g = ((view.log[j * width + i] ?? 0) / view.top) * 255;
      const o = (row * width + column) * 4;
      if (!response) {
        out.data.set([g, g, g, 255], o);
        continue;
      }
      const { fx, fy } = frequencyAt(view, column, row);
      const removed = Math.min(1, Math.max(0, 1 - Math.abs(response(fx, fy))));
      const tint = (c: number) => g * (1 - removed) + removed * (0.4 * g + 0.6 * c);
      out.data.set([tint(TINT[0]), tint(TINT[1]), tint(TINT[2]), 255], o);
    }
  }
  return out;
}
