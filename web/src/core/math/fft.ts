/**
 * The fast Fourier transform for any length. Lengths whose only prime factors are 2, 3 and 5 use
 * a mixed-radix Stockham transform with radix 4, 2, 3 and 5 steps. Other lengths use Bluestein's
 * algorithm, which turns the transform into a convolution of power-of-2 length. Used by the
 * frequency-domain filters, for correlation with large kernels and by the spectral residual
 * saliency map.
 */

interface Plan {
  radices: number[];
  /** cos(2 pi t / n) and sin(2 pi t / n) for t = 0 .. n - 1. */
  cos: Float64Array;
  sin: Float64Array;
  /** Work space for the steps that do not write in place. */
  workRe: Float64Array;
  workIm: Float64Array;
}

interface Chirp {
  /** The power-of-2 length of the convolution. */
  m: number;
  /** The chirp c_t = exp(sign i pi t^2 / n) for t = 0 .. n - 1. */
  cr: Float64Array;
  ci: Float64Array;
  /** The FFT of the conjugate chirp, laid out for circular convolution. */
  br: Float64Array;
  bi: Float64Array;
  /** Work space of length m. */
  ar: Float64Array;
  ai: Float64Array;
}

const plans = new Map<number, Plan>();
const chirps = new Map<number, Chirp>();

/** The radix steps for n, or undefined when n has a prime factor other than 2, 3 and 5. */
function radicesOf(n: number): number[] | undefined {
  const radices: number[] = [];
  let m = n;
  for (const r of [4, 2, 3, 5]) {
    while (m % r === 0) {
      radices.push(r);
      m /= r;
    }
  }
  return m === 1 ? radices : undefined;
}

function planOf(n: number, radices: number[]): Plan {
  let plan = plans.get(n);
  if (!plan) {
    const cos = new Float64Array(n);
    const sin = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      cos[t] = Math.cos((2 * Math.PI * t) / n);
      sin[t] = Math.sin((2 * Math.PI * t) / n);
    }
    plan = { radices, cos, sin, workRe: new Float64Array(n), workIm: new Float64Array(n) };
    plans.set(n, plan);
  }
  return plan;
}

const C3 = Math.sqrt(3) / 2;
const C51 = Math.cos((2 * Math.PI) / 5);
const C52 = Math.cos((4 * Math.PI) / 5);
const S51 = Math.sin((2 * Math.PI) / 5);
const S52 = Math.sin((4 * Math.PI) / 5);

/**
 * Stockham transform by decimation in frequency. Each step splits a transform of length `len`
 * into r transforms of length len / r, which sit interleaved with stride s. The result comes out
 * in natural order, with no bit reversal.
 */
function stockham(re: Float64Array, im: Float64Array, plan: Plan, inverse: boolean): void {
  const n = re.length;
  const sign = inverse ? 1 : -1;
  const { cos, sin } = plan;
  let xr = re;
  let xi = im;
  let yr = plan.workRe;
  let yi = plan.workIm;
  let s = 1;
  let len = n;
  for (const r of plan.radices) {
    const m = len / r;
    const stride = s * m;
    for (let p = 0; p < m; p++) {
      // The twiddle W_len^(p k) is W_n^(p k s), with W_n = exp(sign 2 pi i / n).
      const t1 = p * s;
      const w1r = cos[t1] ?? 0;
      const w1i = sign * (sin[t1] ?? 0);
      const w2r = cos[2 * t1] ?? 0;
      const w2i = sign * (sin[2 * t1] ?? 0);
      const w3r = cos[3 * t1] ?? 0;
      const w3i = sign * (sin[3 * t1] ?? 0);
      const w4r = cos[4 * t1] ?? 0;
      const w4i = sign * (sin[4 * t1] ?? 0);
      for (let q = 0; q < s; q++) {
        const i0 = q + s * p;
        const o0 = q + s * r * p;
        const a0r = xr[i0] ?? 0;
        const a0i = xi[i0] ?? 0;
        const a1r = xr[i0 + stride] ?? 0;
        const a1i = xi[i0 + stride] ?? 0;
        if (r === 2) {
          const dr = a0r - a1r;
          const di = a0i - a1i;
          yr[o0] = a0r + a1r;
          yi[o0] = a0i + a1i;
          yr[o0 + s] = dr * w1r - di * w1i;
          yi[o0 + s] = dr * w1i + di * w1r;
        } else if (r === 4) {
          const a2r = xr[i0 + 2 * stride] ?? 0;
          const a2i = xi[i0 + 2 * stride] ?? 0;
          const a3r = xr[i0 + 3 * stride] ?? 0;
          const a3i = xi[i0 + 3 * stride] ?? 0;
          const t0r = a0r + a2r;
          const t0i = a0i + a2i;
          const t1r = a0r - a2r;
          const t1i = a0i - a2i;
          const t2r = a1r + a3r;
          const t2i = a1i + a3i;
          // W_4 times (a1 - a3), with W_4 = sign i.
          const t3r = -sign * (a1i - a3i);
          const t3i = sign * (a1r - a3r);
          const x1r = t1r + t3r;
          const x1i = t1i + t3i;
          const x2r = t0r - t2r;
          const x2i = t0i - t2i;
          const x3r = t1r - t3r;
          const x3i = t1i - t3i;
          yr[o0] = t0r + t2r;
          yi[o0] = t0i + t2i;
          yr[o0 + s] = x1r * w1r - x1i * w1i;
          yi[o0 + s] = x1r * w1i + x1i * w1r;
          yr[o0 + 2 * s] = x2r * w2r - x2i * w2i;
          yi[o0 + 2 * s] = x2r * w2i + x2i * w2r;
          yr[o0 + 3 * s] = x3r * w3r - x3i * w3i;
          yi[o0 + 3 * s] = x3r * w3i + x3i * w3r;
        } else if (r === 3) {
          const a2r = xr[i0 + 2 * stride] ?? 0;
          const a2i = xi[i0 + 2 * stride] ?? 0;
          const tr = a1r + a2r;
          const ti = a1i + a2i;
          const mr = a0r - tr / 2;
          const mi = a0i - ti / 2;
          // sign i (sqrt 3 / 2) (a1 - a2)
          const dr = -sign * C3 * (a1i - a2i);
          const di = sign * C3 * (a1r - a2r);
          const x1r = mr + dr;
          const x1i = mi + di;
          const x2r = mr - dr;
          const x2i = mi - di;
          yr[o0] = a0r + tr;
          yi[o0] = a0i + ti;
          yr[o0 + s] = x1r * w1r - x1i * w1i;
          yi[o0 + s] = x1r * w1i + x1i * w1r;
          yr[o0 + 2 * s] = x2r * w2r - x2i * w2i;
          yi[o0 + 2 * s] = x2r * w2i + x2i * w2r;
        } else {
          const a2r = xr[i0 + 2 * stride] ?? 0;
          const a2i = xi[i0 + 2 * stride] ?? 0;
          const a3r = xr[i0 + 3 * stride] ?? 0;
          const a3i = xi[i0 + 3 * stride] ?? 0;
          const a4r = xr[i0 + 4 * stride] ?? 0;
          const a4i = xi[i0 + 4 * stride] ?? 0;
          const s1r = a1r + a4r;
          const s1i = a1i + a4i;
          const s2r = a2r + a3r;
          const s2i = a2i + a3i;
          const d1r = a1r - a4r;
          const d1i = a1i - a4i;
          const d2r = a2r - a3r;
          const d2i = a2i - a3i;
          const m1r = a0r + C51 * s1r + C52 * s2r;
          const m1i = a0i + C51 * s1i + C52 * s2i;
          const m2r = a0r + C52 * s1r + C51 * s2r;
          const m2i = a0i + C52 * s1i + C51 * s2i;
          // sign i (S51 d1 + S52 d2) and sign i (S52 d1 - S51 d2)
          const e1r = -sign * (S51 * d1i + S52 * d2i);
          const e1i = sign * (S51 * d1r + S52 * d2r);
          const e2r = -sign * (S52 * d1i - S51 * d2i);
          const e2i = sign * (S52 * d1r - S51 * d2r);
          const x1r = m1r + e1r;
          const x1i = m1i + e1i;
          const x2r = m2r + e2r;
          const x2i = m2i + e2i;
          const x3r = m2r - e2r;
          const x3i = m2i - e2i;
          const x4r = m1r - e1r;
          const x4i = m1i - e1i;
          yr[o0] = a0r + s1r + s2r;
          yi[o0] = a0i + s1i + s2i;
          yr[o0 + s] = x1r * w1r - x1i * w1i;
          yi[o0 + s] = x1r * w1i + x1i * w1r;
          yr[o0 + 2 * s] = x2r * w2r - x2i * w2i;
          yi[o0 + 2 * s] = x2r * w2i + x2i * w2r;
          yr[o0 + 3 * s] = x3r * w3r - x3i * w3i;
          yi[o0 + 3 * s] = x3r * w3i + x3i * w3r;
          yr[o0 + 4 * s] = x4r * w4r - x4i * w4i;
          yi[o0 + 4 * s] = x4r * w4i + x4i * w4r;
        }
      }
    }
    [xr, yr] = [yr, xr];
    [xi, yi] = [yi, xi];
    len = m;
    s *= r;
  }
  if (xr !== re) {
    re.set(xr);
    im.set(xi);
  }
}

function chirpOf(n: number, inverse: boolean): Chirp {
  const key = 2 * n + (inverse ? 1 : 0);
  let chirp = chirps.get(key);
  if (!chirp) {
    const sign = inverse ? 1 : -1;
    const m = nextPow2(2 * n - 1);
    const cr = new Float64Array(n);
    const ci = new Float64Array(n);
    const br = new Float64Array(m);
    const bi = new Float64Array(m);
    for (let t = 0; t < n; t++) {
      // t^2 modulo 2n keeps the angle small, so it stays exact for large t.
      const angle = (Math.PI * ((t * t) % (2 * n))) / n;
      cr[t] = Math.cos(angle);
      ci[t] = sign * Math.sin(angle);
      br[t] = cr[t] ?? 0;
      bi[t] = -(ci[t] ?? 0);
      if (t > 0) {
        br[m - t] = br[t] ?? 0;
        bi[m - t] = bi[t] ?? 0;
      }
    }
    fft(br, bi);
    chirp = { m, cr, ci, br, bi, ar: new Float64Array(m), ai: new Float64Array(m) };
    chirps.set(key, chirp);
  }
  return chirp;
}

/**
 * Bluestein's algorithm. With c_t = exp(sign i pi t^2 / n), the identity
 * n k = (n^2 + k^2 - (k - n)^2) / 2 gives X_k = c_k sum_t (x_t c_t) conj(c_(k - t)), a
 * convolution that a power-of-2 FFT computes.
 */
function bluestein(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  const { m, cr, ci, br, bi, ar, ai } = chirpOf(n, inverse);
  ar.fill(0);
  ai.fill(0);
  for (let t = 0; t < n; t++) {
    const xr = re[t] ?? 0;
    const xi = im[t] ?? 0;
    const c = cr[t] ?? 0;
    const d = ci[t] ?? 0;
    ar[t] = xr * c - xi * d;
    ai[t] = xr * d + xi * c;
  }
  fft(ar, ai);
  for (let k = 0; k < m; k++) {
    const a = ar[k] ?? 0;
    const b = ai[k] ?? 0;
    const c = br[k] ?? 0;
    const d = bi[k] ?? 0;
    ar[k] = a * c - b * d;
    ai[k] = a * d + b * c;
  }
  fft(ar, ai, true);
  for (let k = 0; k < n; k++) {
    const a = (ar[k] ?? 0) / m;
    const b = (ai[k] ?? 0) / m;
    const c = cr[k] ?? 0;
    const d = ci[k] ?? 0;
    re[k] = a * c - b * d;
    im[k] = a * d + b * c;
  }
}

/**
 * In-place FFT of one complex sequence of any length. The forward transform is
 * X_k = sum_t x_t exp(-2 pi i t k / n), as in NumPy. `inverse` flips the sign of the exponent and
 * leaves out the 1/n factor.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (im.length !== n) throw new RangeError("The real and imaginary parts differ in length.");
  if (n <= 1) return;
  const radices = radicesOf(n);
  if (radices) stockham(re, im, planOf(n, radices), inverse);
  else bluestein(re, im, inverse);
}

/** The smallest power of 2 that is at least n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * The smallest length of at least n whose only prime factors are 2, 3 and 5. The FFT is fastest
 * for these lengths, and they are much closer to n than the next power of 2.
 */
export function nextFastSize(n: number): number {
  for (let m = Math.max(1, Math.ceil(n)); ; m++) {
    if (radicesOf(m)) return m;
  }
}

/** 2D FFT of a rows x cols grid of any size, in place: rows first, then columns. */
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
