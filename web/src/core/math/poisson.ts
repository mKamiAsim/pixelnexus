/**
 * Poisson random numbers from a supply of uniform numbers, for the Poisson noise generator.
 *
 * The uniforms come from a function of an index, so a pixel can draw as many as it needs from
 * its own position-based stream. The method is the one of NumPy's legacy generator: the
 * multiplication method of Knuth for small means, and the transformed rejection method with
 * squeeze, PTRS, of Hörmann (1993) for means of 10 and more.
 */

/** Coefficients of the Lanczos approximation with g = 7 and nine terms. */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** The natural logarithm of the gamma function, for x of 0.5 or more. */
export function logGamma(x: number): number {
  const z = x - 1;
  let a = LANCZOS[0] ?? 1;
  for (let i = 1; i < LANCZOS.length; i++) a += (LANCZOS[i] ?? 0) / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * A Poisson number with mean `lambda`. `uniform(i)` must return the i-th uniform number in
 * (0, 1) of this draw. At most `limit` uniforms are used. The rejection loop ends after one or
 * two rounds almost always, and the rounded mean is the fallback if it does not.
 */
export function poissonSample(
  lambda: number,
  uniform: (index: number) => number,
  limit = 64,
): number {
  if (lambda <= 0) return 0;
  let index = 0;
  if (lambda < 10) {
    // Knuth: count uniforms until their product falls below exp(-lambda).
    const threshold = Math.exp(-lambda);
    let product = 1;
    let k = 0;
    while (index < limit) {
      product *= uniform(index++);
      if (product <= threshold) return k;
      k++;
    }
    return Math.round(lambda);
  }
  // Hörmann's PTRS.
  const slam = Math.sqrt(lambda);
  const loglam = Math.log(lambda);
  const b = 0.931 + 2.53 * slam;
  const a = -0.059 + 0.02483 * b;
  const invalpha = 1.1239 + 1.1328 / (b - 3.4);
  const vr = 0.9277 - 3.6224 / (b - 2);
  while (index + 1 < limit) {
    const u = uniform(index++) - 0.5;
    const v = uniform(index++);
    const us = 0.5 - Math.abs(u);
    const k = Math.floor(((2 * a) / us + b) * u + lambda + 0.43);
    if (us >= 0.07 && v <= vr) return k;
    if (k < 0 || (us < 0.013 && v > us)) continue;
    const left = Math.log(v) + Math.log(invalpha) - Math.log(a / (us * us) + b);
    if (left <= -lambda + k * loglam - logGamma(k + 1)) return k;
  }
  return Math.round(lambda);
}
