/**
 * Color threshold. Catalog entry: catalog/filters/enhancement/color-threshold.yaml.
 *
 * A pixel is white when its hue, saturation and value all lie in their ranges, and black
 * otherwise, or the other way around with Invert. HSV is Smith's hexcone model, as in
 * convert.ts. The bounds count as inside, as in OpenCV's inRange. When the smallest hue is above
 * the largest, the hue range wraps through 0 degrees, so 330 to 30 selects reds.
 */
import { rgbToHsv } from "@/core/color/convert";
import { read, type Params, type PixelFilter } from "@/core/filters/types";

export interface HsvRanges {
  readonly hue: readonly [number, number];
  readonly saturation: readonly [number, number];
  readonly value: readonly [number, number];
  readonly invert: boolean;
}

export const hsvRanges = (params: Params): HsvRanges => ({
  hue: [read.number(params, "hueMin", 330), read.number(params, "hueMax", 30)],
  saturation: [read.number(params, "satMin", 40) / 100, read.number(params, "satMax", 100) / 100],
  value: [read.number(params, "valMin", 30) / 100, read.number(params, "valMax", 100) / 100],
  invert: read.boolean(params, "invert", false),
});

/** True when the hue lies in [lo, hi], or outside (hi, lo) when the range wraps through 0. */
export function hueInside(hue: number, lo: number, hi: number): boolean {
  return lo <= hi ? hue >= lo && hue <= hi : hue >= lo || hue <= hi;
}

export function insideRanges(r: number, g: number, b: number, ranges: HsvRanges): boolean {
  const [h, s, v] = rgbToHsv(r, g, b);
  return (
    hueInside(h, ranges.hue[0], ranges.hue[1]) &&
    s >= ranges.saturation[0] &&
    s <= ranges.saturation[1] &&
    v >= ranges.value[0] &&
    v <= ranges.value[1]
  );
}

export const colorThresholdFilter: PixelFilter = {
  id: "color-threshold",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => {
    const ranges = hsvRanges(params);
    out.fill(insideRanges(r, g, b, ranges) !== ranges.invert ? 255 : 0);
  },
  representation: (params) => {
    const { hue, saturation, value, invert } = hsvRanges(params);
    const wraps = hue[0] > hue[1];
    const pct = (x: number) => Math.round(x * 1000) / 10;
    return {
      kind: "stages",
      stages: [
        {
          name: "Hue, saturation and value",
          formula: "(H, S, V) = \\operatorname{hsv}(R, G, B)",
          note: "Smith's hexcone model. H in degrees, S and V from 0 to 1.",
        },
        {
          name: "Ranges",
          formula: `${wraps ? `H \\ge ${hue[0]} \\text{ or } H \\le ${hue[1]}` : `${hue[0]} \\le H \\le ${hue[1]}`},\\quad ${pct(saturation[0])}\\,\\% \\le S \\le ${pct(saturation[1])}\\,\\%,\\quad ${pct(value[0])}\\,\\% \\le V \\le ${pct(value[1])}\\,\\%`,
          ...(wraps ? { note: "The hue range wraps through 0 degrees." } : {}),
        },
        {
          name: "Mask",
          formula: invert
            ? "I_{\\text{out}} = 0 \\text{ inside the ranges}, 255 \\text{ outside}"
            : "I_{\\text{out}} = 255 \\text{ inside the ranges}, 0 \\text{ outside}",
        },
      ],
    };
  },
};
