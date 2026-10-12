/**
 * Exact Euclidean distance transform.
 *
 * For every pixel, the squared distance to the nearest pixel of a set, measured between pixel
 * centers. It uses the lower envelope of parabolas in one dimension, first along columns and
 * then along rows, from P. F. Felzenszwalb and D. P. Huttenlocher, "Distance Transforms of
 * Sampled Functions", Theory of Computing 8 (2012). The time is linear in the number of pixels.
 */

/** Larger than any squared distance in an image, small enough to keep arithmetic finite. */
const FAR = 1e20;

/** One pass in place: f holds the input values on entry and the result on exit. */
function transform1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    const fq = (f[q] ?? FAR) + q * q;
    let vk = v[k] ?? 0;
    let s = (fq - ((f[vk] ?? FAR) + vk * vk)) / (2 * q - 2 * vk);
    while (s <= (z[k] ?? -Infinity)) {
      k--;
      vk = v[k] ?? 0;
      s = (fq - ((f[vk] ?? FAR) + vk * vk)) / (2 * q - 2 * vk);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const vk = v[k] ?? 0;
    d[q] = (q - vk) * (q - vk) + (f[vk] ?? FAR);
  }
  for (let q = 0; q < n; q++) f[q] = d[q] ?? FAR;
}

/**
 * Squared distance from each pixel to the nearest pixel where `inSet` is true. Pixels in the
 * set get 0. If the set is empty, every value stays at about 1e20.
 */
export function squaredDistance(
  width: number,
  height: number,
  inSet: (index: number) => boolean,
): Float64Array {
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = inSet(i) ? 0 : FAR;
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x] ?? FAR;
    transform1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = f[y] ?? FAR;
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = grid[row + x] ?? FAR;
    transform1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[row + x] = f[x] ?? FAR;
  }
  return grid;
}
