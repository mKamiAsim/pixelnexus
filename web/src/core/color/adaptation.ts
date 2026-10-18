/**
 * Chromatic adaptation and the colors of light sources.
 *
 * - White points of the CIE illuminants for the 2 degree observer, normalized to Y = 1, from
 *   ASTM E308-01 as tabled by Bruce Lindbloom.
 * - The cone response matrices of the von Kries and Bradford transforms, and plain XYZ scaling,
 *   as tabled by Lindbloom. An adaptation maps the cone responses of the source white onto those
 *   of the target white: M = M_A^-1 diag(target / source) M_A.
 * - The chromaticity of a Planckian (blackbody) light at a temperature, with the cubic spline of
 *   Kang, Moon, Hong, Lee, Cho and Kim (2002), valid from 1667 K to 25000 K.
 * - Duv: the signed distance from the Planckian locus in the CIE 1960 uv diagram. Positive values
 *   lie above the locus, toward green.
 */
import { RGB_TO_XYZ } from "./convert";

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const ILLUMINANTS = {
  A: [1.0985, 1, 0.35585],
  D50: [0.96422, 1, 0.82521],
  D55: [0.95682, 1, 0.92149],
  D65: [0.95047, 1, 1.08883],
  D75: [0.94972, 1, 1.22638],
  F2: [0.99186, 1, 0.67393],
  F7: [0.95041, 1, 1.08747],
  F11: [1.00962, 1, 0.6435],
} as const satisfies Record<string, Vec3>;

export type Illuminant = keyof typeof ILLUMINANTS;

export const CONE_MATRICES = {
  bradford: [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296],
  ],
  "von-kries": [
    [0.40024, 0.7076, -0.08081],
    [-0.2263, 1.16532, 0.0457],
    [0, 0, 0.91822],
  ],
  "xyz-scaling": [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
} as const satisfies Record<string, Mat3>;

export type AdaptationMethod = keyof typeof CONE_MATRICES;

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const row = (i: number): Vec3 => {
    const r = a[i] ?? [0, 0, 0];
    return [0, 1, 2].map(
      (j) => r[0] * (b[0][j] ?? 0) + r[1] * (b[1][j] ?? 0) + r[2] * (b[2][j] ?? 0),
    ) as unknown as Vec3;
  };
  return [row(0), row(1), row(2)];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function invert(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

/** The XYZ adaptation matrix from one white to another. */
export function adaptationMatrix(source: Vec3, target: Vec3, method: AdaptationMethod): Mat3 {
  const ma = CONE_MATRICES[method];
  const s = apply(ma, source);
  const t = apply(ma, target);
  const scale: Mat3 = [
    [t[0] / s[0], 0, 0],
    [0, t[1] / s[1], 0],
    [0, 0, t[2] / s[2]],
  ];
  return multiply(invert(ma), multiply(scale, ma));
}

/** Linear sRGB to XYZ, the matrix of the color conversions. */
export const SRGB_TO_XYZ: Mat3 = RGB_TO_XYZ;
export const XYZ_TO_SRGB: Mat3 = invert(SRGB_TO_XYZ);

/** The matrix that adapts linear sRGB colors seen under one white to another. */
export function rgbAdaptation(source: Vec3, target: Vec3, method: AdaptationMethod): Mat3 {
  return multiply(XYZ_TO_SRGB, multiply(adaptationMatrix(source, target, method), SRGB_TO_XYZ));
}

/** Chromaticity x, y of a Planckian light, by the spline of Kang and colleagues (2002). */
export function planckianXy(kelvin: number): [number, number] {
  const t = Math.min(25000, Math.max(1667, kelvin));
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

const xyToUv = (x: number, y: number): [number, number] => {
  const d = -2 * x + 12 * y + 3;
  return [(4 * x) / d, (6 * y) / d];
};
const uvToXy = (u: number, v: number): [number, number] => {
  const d = 2 * u - 8 * v + 4;
  return [(3 * u) / d, (2 * v) / d];
};

/**
 * The white of a light at a temperature, moved by Duv across the Planckian locus in CIE 1960
 * uv, as XYZ with Y = 1. The direction across is perpendicular to the locus, found from two
 * nearby temperatures, and points toward larger v.
 */
export function lightWhite(kelvin: number, duv: number): Vec3 {
  const [u, v] = xyToUv(...planckianXy(kelvin));
  const [u1, v1] = xyToUv(...planckianXy(kelvin * 0.99));
  const [u2, v2] = xyToUv(...planckianXy(kelvin * 1.01));
  const tu = u2 - u1;
  const tv = v2 - v1;
  const length = Math.hypot(tu, tv);
  let nu = -tv / length;
  let nv = tu / length;
  if (nv < 0) {
    nu = -nu;
    nv = -nv;
  }
  const [x, y] = uvToXy(u + duv * nu, v + duv * nv);
  return [x / y, 1, (1 - x - y) / y];
}
