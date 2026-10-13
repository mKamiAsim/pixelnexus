/**
 * Dead-pixel correction. Catalog entry: catalog/filters/restoration/dead-pixel.yaml.
 *
 * A dead, stuck or hot pixel differs strongly from its neighbors in at least one channel. For
 * each pixel, the filter takes the median of each channel over its neighbors, without the pixel
 * itself. When any channel differs from that median by more than the threshold, all three
 * channels are replaced by the medians. Other pixels are left exactly as they are.
 *
 * The neighbors are the window minus its center, an even count, so the median is the mean of the
 * two middle values, as numpy.median gives it.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

const sizeOf = (params: Params) => read.number(params, "size", 3);
const thresholdOf = (params: Params) => read.number(params, "threshold", 50);

/** The median of the first n values of a buffer. The buffer is sorted in place. */
export function medianOf(values: Float64Array, n: number): number {
  const sorted = values.subarray(0, n).sort();
  const mid = n >> 1;
  return n % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Median of each channel over the window around every pixel, without the pixel itself. */
export function neighborMedians(
  planes: readonly [Plane, Plane, Plane],
  size: number,
  border: BorderMode,
): [Plane, Plane, Plane] {
  const { width, height } = planes[0];
  const radius = (size - 1) >> 1;
  const xs = borderTable(width, radius, border);
  const ys = borderTable(height, radius, border);
  const buffer = new Float64Array(size * size);
  return planes.map((plane) => {
    const out = createPlane(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let n = 0;
        for (let j = 0; j < size; j++) {
          const sy = ys[y + j] ?? -1;
          for (let i = 0; i < size; i++) {
            if (i === radius && j === radius) continue;
            const sx = xs[x + i] ?? -1;
            buffer[n++] = sx < 0 || sy < 0 ? 0 : (plane.data[sy * width + sx] ?? 0);
          }
        }
        out.data[y * width + x] = medianOf(buffer, n);
      }
    }
    return out;
  }) as [Plane, Plane, Plane];
}

export const deadPixelFilter: ColorFilter = {
  id: "dead-pixel",
  kind: "color",
  radius: (params) => (sizeOf(params) - 1) >> 1,
  color: (planes, params, { border }) => {
    const medians = neighborMedians(planes, sizeOf(params), border);
    const t = thresholdOf(params);
    const mask = read.string<"repaired" | "mask">(params, "output", "repaired") === "mask";
    const { width, height } = planes[0];
    const out = [
      createPlane(width, height),
      createPlane(width, height),
      createPlane(width, height),
    ];
    for (let i = 0; i < width * height; i++) {
      const bad = planes.some((p, c) => Math.abs((p.data[i] ?? 0) - (medians[c].data[i] ?? 0)) > t);
      out.forEach((plane, c) => {
        plane.data[i] = mask
          ? bad
            ? 255
            : 0
          : bad
            ? (medians[c].data[i] ?? 0)
            : (planes[c].data[i] ?? 0);
      });
    }
    return out as [Plane, Plane, Plane];
  },
  representation: (params) => {
    const size = sizeOf(params);
    return {
      kind: "window",
      size,
      count: size * size - 1,
      statistic: "\\operatorname{median}\\,(W \\setminus \\{z_{xy}\\})",
      note: `The neighbors are the ${size}x${size} window without the center pixel. A pixel is repaired when any channel differs from its neighbor median by more than ${thresholdOf(params)}.`,
    };
  },
};
