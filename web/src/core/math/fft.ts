/**
 * The fast Fourier transform: radix 2, in place, for lengths that are powers of 2. Used for
 * correlation with large kernels and by the spectral residual saliency map.
 */

/**
 * In-place radix-2 FFT of one complex sequence, length a power of 2. `inverse` runs the inverse
 * transform without the 1/n factor.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n & (n - 1)) throw new RangeError("The length must be a power of 2.");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    for (let k = 0; k < size / 2; k++) {
      const wr = Math.cos(angle * k);
      const wi = Math.sin(angle * k);
      for (let start = 0; start < n; start += size) {
        const a = start + k;
        const b = a + size / 2;
        const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
    }
  }
}

/** The smallest power of 2 that is at least n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** 2D FFT of a rows x cols grid, both powers of 2, in place: rows first, then columns. */
export function fft2d(
  re: Float64Array,
  im: Float64Array,
  rows: number,
  cols: number,
  inverse: boolean,
): void {
  const rr = new Float64Array(cols);
  const ri = new Float64Array(cols);
  for (let y = 0; y < rows; y++) {
    rr.set(re.subarray(y * cols, (y + 1) * cols));
    ri.set(im.subarray(y * cols, (y + 1) * cols));
    // The transform of a row of zeros is zeros. Kernels and padding leave many such rows.
    if (rr.every((v) => v === 0) && ri.every((v) => v === 0)) continue;
    fft(rr, ri, inverse);
    re.set(rr, y * cols);
    im.set(ri, y * cols);
  }
  const cr = new Float64Array(rows);
  const ci = new Float64Array(rows);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      cr[y] = re[y * cols + x] ?? 0;
      ci[y] = im[y * cols + x] ?? 0;
    }
    fft(cr, ci, inverse);
    for (let y = 0; y < rows; y++) {
      re[y * cols + x] = cr[y] ?? 0;
      im[y * cols + x] = ci[y] ?? 0;
    }
  }
}
