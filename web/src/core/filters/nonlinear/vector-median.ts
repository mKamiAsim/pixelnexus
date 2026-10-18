/**
 * Vector median filter (Astola, Haavisto and Neuvo, 1990). Catalog entry:
 * catalog/filters/nonlinear/vector-median.yaml.
 *
 * Each pixel is a color vector (R, G, B). The output is the window vector whose summed distance
 * to all the other window vectors is the smallest. It is always one of the colors in the window,
 * so no new colors appear. On a tie, the first vector in reading order wins. For a gray image it
 * equals the plain median.
 */
import { borderTable, createPlane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

const sizeOf = (params: Params) => read.number(params, "size", 3);
type Norm = "l2" | "l1";
const normOf = (params: Params) => read.string<Norm>(params, "norm", "l2");

/** Index of the vector median among n vectors stored as r, g, b triples. */
export function vectorMedianIndex(vectors: Float64Array, n: number, norm: Norm): number {
  const sums = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dr = (vectors[3 * i] ?? 0) - (vectors[3 * j] ?? 0);
      const dg = (vectors[3 * i + 1] ?? 0) - (vectors[3 * j + 1] ?? 0);
      const db = (vectors[3 * i + 2] ?? 0) - (vectors[3 * j + 2] ?? 0);
      const d =
        norm === "l1"
          ? Math.abs(dr) + Math.abs(dg) + Math.abs(db)
          : Math.sqrt(dr * dr + dg * dg + db * db);
      sums[i] = (sums[i] ?? 0) + d;
      sums[j] = (sums[j] ?? 0) + d;
    }
  }
  let best = 0;
  for (let i = 1; i < n; i++) if ((sums[i] ?? 0) < (sums[best] ?? 0) - 1e-9) best = i;
  return best;
}

export const vectorMedianFilter: ColorFilter = {
  id: "vector-median",
  kind: "color",
  radius: (params) => (sizeOf(params) - 1) >> 1,
  color: ([r, g, b], params, { border }) => {
    const { width, height } = r;
    const size = sizeOf(params);
    const radius = (size - 1) >> 1;
    const norm = normOf(params);
    const xs = borderTable(width, radius, border);
    const ys = borderTable(height, radius, border);
    const n = size * size;
    const vectors = new Float64Array(3 * n);
    const out = [
      createPlane(width, height),
      createPlane(width, height),
      createPlane(width, height),
    ];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let k = 0;
        for (let j = 0; j < size; j++) {
          const sy = ys[y + j] ?? -1;
          for (let i = 0; i < size; i++) {
            const sx = xs[x + i] ?? -1;
            const at = sx < 0 || sy < 0 ? -1 : sy * width + sx;
            vectors[k++] = at < 0 ? 0 : (r.data[at] ?? 0);
            vectors[k++] = at < 0 ? 0 : (g.data[at] ?? 0);
            vectors[k++] = at < 0 ? 0 : (b.data[at] ?? 0);
          }
        }
        const best = vectorMedianIndex(vectors, n, norm);
        const o = y * width + x;
        out.forEach((plane, c) => (plane.data[o] = vectors[3 * best + c] ?? 0));
      }
    }
    return out as [typeof r, typeof g, typeof b];
  },
  representation: (params) => {
    const size = sizeOf(params);
    const norm = normOf(params);
    return {
      kind: "window",
      size,
      count: size * size,
      statistic: `\\operatorname*{arg\\,min}_{v_i \\in W} \\sum_{v_j \\in W} \\lVert v_i - v_j \\rVert_{${norm === "l1" ? 1 : 2}}`,
      note: `The window color whose summed ${norm === "l1" ? "L1" : "L2"} distance to all the other window colors is the smallest. It is always one of the window colors.`,
    };
  },
};
