/**
 * Small deterministic random number generators. Tests, sample images and noise generators use
 * them, so the same seed always gives the same pixels.
 */

/** Mulberry32: a fast 32-bit generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples from a uniform generator, using the Box-Muller transform. */
export function normalSampler(uniform: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    while (u === 0) u = uniform();
    const v = uniform();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };
}

/**
 * A 32-bit integer hash with good mixing ("lowbias32" by Chris Wellons, public domain).
 * Used to make random numbers that depend only on a position, not on the order of calls.
 */
export function hash32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A uniform number in (0, 1) for one pixel position. The same seed, position and stream always
 * give the same number. So noise does not change when the image is split into tiles.
 */
export function positionUniform(seed: number, x: number, y: number, stream: number): number {
  const h = hash32(seed ^ hash32(x ^ hash32(y ^ hash32(stream + 0x9e3779b9))));
  return (h + 0.5) / 4294967296;
}

/** A standard normal number for one pixel position, from two position uniforms (Box-Muller). */
export function positionNormal(seed: number, x: number, y: number, stream: number): number {
  const u = positionUniform(seed, x, y, 2 * stream);
  const v = positionUniform(seed, x, y, 2 * stream + 1);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
