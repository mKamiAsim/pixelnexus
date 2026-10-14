/**
 * Color conversions for one pixel at a time. Inputs and outputs use these ranges:
 *
 * - sRGB encoded values: 0 to 255.
 * - Linear light values: 0 to 1.
 * - HSV and HSL: hue in degrees from 0 up to 360, the other two from 0 to 1.
 * - CIE Lab (D65 white, 2 degree observer): L from 0 to 100.
 *
 * The formulas follow IEC 61966-2-1 (sRGB) and CIE 15. Tests compare them with scikit-image.
 */

export type Rgb = readonly [number, number, number];

/** sRGB encoded value (0 to 255) to linear light (0 to 1). */
export function srgbToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0 to 1) to sRGB encoded value (0 to 255), not rounded. */
export function linearToSrgb(value: number): number {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** Luma from encoded values with BT.709 weights. This is what PixelNexus calls brightness. */
export function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relative luminance from linear values with BT.709 weights, from 0 to 1. */
export function luminance709(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function rgbToHsv(r: number, g: number, b: number): Rgb {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, max === 0 ? 0 : delta / max, max];
}

/** HSV to sRGB encoded values (0 to 255), not rounded. */
export function hsvToRgb(hue: number, saturation: number, value: number): Rgb {
  const h = (((hue % 360) + 360) % 360) / 60;
  const c = value * saturation;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = value - c;
  const sector = Math.floor(h);
  const [r, g, b] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** sRGB encoded values to HSL, the hexcone model with lightness (max + min) / 2. */
export function rgbToHsl(r: number, g: number, b: number): Rgb {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
  const [hue] = rgbToHsv(r, g, b);
  return [hue, saturation, lightness];
}

/** HSL to sRGB encoded values (0 to 255), not rounded. */
export function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const value = lightness + c / 2;
  return hsvToRgb(hue, value === 0 ? 0 : c / value, value);
}

// sRGB primaries with D65 white, from IEC 61966-2-1.
export const RGB_TO_XYZ = [
  [0.412453, 0.35758, 0.180423],
  [0.212671, 0.71516, 0.072169],
  [0.019334, 0.119193, 0.950227],
] as const;

// D65 reference white for the 2 degree observer, as used by scikit-image.
const WHITE_D65 = [0.95047, 1.0, 1.08883] as const;

export function rgbToXyz(r: number, g: number, b: number): Rgb {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const row = ([a, c, d]: readonly [number, number, number]) => a * lr + c * lg + d * lb;
  return [row(RGB_TO_XYZ[0]), row(RGB_TO_XYZ[1]), row(RGB_TO_XYZ[2])];
}

export function rgbToLab(r: number, g: number, b: number): Rgb {
  const [x, y, z] = rgbToXyz(r, g, b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / WHITE_D65[0]);
  const fy = f(y / WHITE_D65[1]);
  const fz = f(z / WHITE_D65[2]);
  const lightness = y / WHITE_D65[1] > 0.008856 ? 116 * fy - 16 : 903.3 * (y / WHITE_D65[1]);
  return [lightness, 500 * (fx - fy), 200 * (fy - fz)];
}
