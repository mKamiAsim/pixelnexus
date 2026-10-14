/**
 * Color adjustments of one pixel at a time, on encoded sRGB values. Catalog entries:
 * catalog/filters/enhancement/{bw-mix,sepia,saturation,vibrance,hue-rotate,hsv-adjust,
 * channel-mixer,color-balance}.yaml.
 *
 * - Sepia, saturation and hue rotation use the matrices of the CSS filter functions sepia(),
 *   saturate() and hue-rotate() in the W3C Filter Effects Module Level 1, with the weights
 *   0.213, 0.715 and 0.072 that the spec gives.
 * - Black-and-white conversion and the channel mixer are weighted sums with weights in percent.
 * - Vibrance is a rule of PixelNexus's own: the saturation gain 1 + a (1 - S) falls with the
 *   HSV saturation S of the pixel, so muted colors change more than vivid ones.
 * - HSV adjustment shifts the hue and scales saturation and value in the hexcone model of Smith.
 * - Color balance follows GIMP's Color Balance: each channel gets shift amounts for shadows,
 *   midtones and highlights, weighted by masks of the HSL lightness of the pixel, and clipped.
 *   Preserve luminosity puts the HSL lightness of the input back.
 */
import { hslToRgb, hsvToRgb, rgbToHsl, rgbToHsv } from "@/core/color/convert";
import { read, type Params, type PixelFilter, type Representation } from "@/core/filters/types";

type Matrix = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

function applyMatrix(m: Matrix, r: number, g: number, b: number, out: Float64Array) {
  for (let i = 0; i < 3; i++) {
    const row = m[i] ?? [0, 0, 0];
    out[i] = row[0] * r + row[1] * g + row[2] * b;
  }
}

const fmt = (v: number) => String(Number(v.toFixed(4)));

function matrixStages(name: string, m: Matrix, note: string): Representation {
  const rows = m.map((row) => row.map(fmt).join(" & ")).join(" \\\\ ");
  return {
    kind: "stages",
    stages: [
      {
        name,
        formula: `\\begin{bmatrix} R' \\\\ G' \\\\ B' \\end{bmatrix} = \\begin{bmatrix} ${rows} \\end{bmatrix} \\begin{bmatrix} R \\\\ G \\\\ B \\end{bmatrix}`,
        note,
      },
    ],
  };
}

const ENCODED = "Applied to the encoded sRGB values from 0 to 255.";

function matrixFilter(name: string, matrixOf: (params: Params) => Matrix) {
  return {
    kind: "pixel" as const,
    radius: () => 0,
    pixel: (r: number, g: number, b: number, params: Params, out: Float64Array) =>
      applyMatrix(matrixOf(params), r, g, b, out),
    representation: (params: Params) => matrixStages(name, matrixOf(params), ENCODED),
  };
}

// Black-and-white conversion ---------------------------------------------------------------

const mixWeights = (params: Params) =>
  [
    read.number(params, "red", 30) / 100,
    read.number(params, "green", 59) / 100,
    read.number(params, "blue", 11) / 100,
  ] as const;

export const bwMixFilter: PixelFilter = {
  id: "bw-mix",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => {
    const [wr, wg, wb] = mixWeights(params);
    out.fill(wr * r + wg * g + wb * b);
  },
  representation: (params) => {
    const [wr, wg, wb] = mixWeights(params);
    return {
      kind: "weights",
      weights: [
        { name: "w_R", value: wr },
        { name: "w_G", value: wg },
        { name: "w_B", value: wb },
      ],
      space: "encoded",
    };
  },
};

// Matrices of the Filter Effects spec ---------------------------------------------------------

export function sepiaMatrix(amount: number): Matrix {
  const k = 1 - Math.min(1, Math.max(0, amount));
  return [
    [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k],
    [0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k],
    [0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k],
  ];
}

export function saturateMatrix(s: number): Matrix {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

export function hueRotateMatrix(degrees: number): Matrix {
  const c = Math.cos((degrees * Math.PI) / 180);
  const s = Math.sin((degrees * Math.PI) / 180);
  return [
    [0.213 + 0.787 * c - 0.213 * s, 0.715 - 0.715 * c - 0.715 * s, 0.072 - 0.072 * c + 0.928 * s],
    [0.213 - 0.213 * c + 0.143 * s, 0.715 + 0.285 * c + 0.14 * s, 0.072 - 0.072 * c - 0.283 * s],
    [0.213 - 0.213 * c - 0.787 * s, 0.715 - 0.715 * c + 0.715 * s, 0.072 + 0.928 * c + 0.072 * s],
  ];
}

export const sepiaFilter: PixelFilter = {
  id: "sepia",
  ...matrixFilter("Sepia matrix", (params) =>
    sepiaMatrix(read.number(params, "amount", 100) / 100),
  ),
};
export const saturationFilter: PixelFilter = {
  id: "saturation",
  ...matrixFilter("Saturate matrix", (params) =>
    saturateMatrix(read.number(params, "saturation", 150) / 100),
  ),
};
export const hueRotateFilter: PixelFilter = {
  id: "hue-rotate",
  ...matrixFilter("Hue rotation matrix", (params) =>
    hueRotateMatrix(read.number(params, "angle", 90)),
  ),
};

// Channel mixer ------------------------------------------------------------------------------

const MIXER_KEYS = [
  ["redFromRed", "redFromGreen", "redFromBlue"],
  ["greenFromRed", "greenFromGreen", "greenFromBlue"],
  ["blueFromRed", "blueFromGreen", "blueFromBlue"],
] as const;

const mixerMatrix = (params: Params): Matrix =>
  MIXER_KEYS.map((row, i) =>
    row.map((key, j) => read.number(params, key, i === j ? 100 : 0) / 100),
  ) as unknown as Matrix;

export const channelMixerFilter: PixelFilter = {
  id: "channel-mixer",
  ...matrixFilter("Mixing matrix", mixerMatrix),
};

// Vibrance -----------------------------------------------------------------------------------

/** The luma weights of the Filter Effects spec, which saturation also uses. */
const LUMA = [0.213, 0.715, 0.072] as const;

export const vibranceFilter: PixelFilter = {
  id: "vibrance",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => {
    const a = read.number(params, "vibrance", 50) / 100;
    const max = Math.max(r, g, b);
    const saturation = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
    const gain = 1 + a * (1 - saturation);
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    out[0] = y + gain * (r - y);
    out[1] = y + gain * (g - y);
    out[2] = y + gain * (b - y);
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Saturation of the pixel",
        formula: "S = \\frac{\\max(R, G, B) - \\min(R, G, B)}{\\max(R, G, B)}",
      },
      {
        name: "Gain",
        formula: `k = 1 + a\\,(1 - S),\\quad a = ${read.number(params, "vibrance", 50) / 100}`,
        note: "Muted colors, with small S, get the most gain.",
      },
      {
        name: "Mix",
        formula: "C' = Y + k\\,(C - Y),\\quad Y = 0.213 R + 0.715 G + 0.072 B",
        note: "For each channel C.",
      },
    ],
  }),
};

// HSV adjustment -----------------------------------------------------------------------------

export const hsvAdjustFilter: PixelFilter = {
  id: "hsv-adjust",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => {
    const [h, s, v] = rgbToHsv(r, g, b);
    const [nr, ng, nb] = hsvToRgb(
      h + read.number(params, "hue", 0),
      Math.min(1, s * (read.number(params, "saturation", 130) / 100)),
      Math.min(1, v * (read.number(params, "value", 100) / 100)),
    );
    out[0] = nr;
    out[1] = ng;
    out[2] = nb;
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      { name: "To HSV", formula: "(H, S, V) = \\operatorname{hsv}(R, G, B)" },
      {
        name: "Adjust",
        formula: `H' = H + ${read.number(params, "hue", 0)}^{\\circ},\\quad S' = \\min(1, ${read.number(params, "saturation", 130) / 100}\\,S),\\quad V' = \\min(1, ${read.number(params, "value", 100) / 100}\\,V)`,
      },
      { name: "Back to RGB", formula: "(R', G', B') = \\operatorname{rgb}(H', S', V')" },
    ],
  }),
};

// Color balance ------------------------------------------------------------------------------

const TONES = ["shadows", "midtones", "highlights"] as const;
const AXES = ["CyanRed", "MagentaGreen", "YellowBlue"] as const;
const BALANCE_DEFAULTS: Readonly<Record<string, number>> = {
  midtonesCyanRed: 20,
  midtonesYellowBlue: -20,
};

/** The masks of GIMP's Color Balance: ramps of width 0.25 at lightness 0.333 and 0.667. */
export function toneMasks(lightness: number): [number, number, number] {
  const a = 0.25;
  const b = 0.333;
  const scale = 0.7;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp((lightness - b) / -a + 0.5) * scale,
    clamp((lightness - b) / a + 0.5) * clamp((lightness + b - 1) / -a + 0.5) * scale,
    clamp((lightness + b - 1) / a + 0.5) * scale,
  ];
}

export const colorBalanceFilter: PixelFilter = {
  id: "color-balance",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => {
    const [, , lightness] = rgbToHsl(r, g, b);
    const masks = toneMasks(lightness);
    [r, g, b].forEach((v, c) => {
      let value = v / 255;
      TONES.forEach((tone, t) => {
        const key = `${tone}${AXES[c] ?? ""}`;
        value += (read.number(params, key, BALANCE_DEFAULTS[key] ?? 0) / 100) * (masks[t] ?? 0);
      });
      out[c] = Math.min(1, Math.max(0, value)) * 255;
    });
    if (read.boolean(params, "preserveLuminosity", true)) {
      const [h, s] = rgbToHsl(out[0] ?? 0, out[1] ?? 0, out[2] ?? 0);
      const [nr, ng, nb] = hslToRgb(h, s, lightness);
      out[0] = nr;
      out[1] = ng;
      out[2] = nb;
    }
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Tone masks",
        formula:
          "m_s(L) = 0.7\\,\\operatorname{clip}\\!\\left(\\tfrac{0.333 - L}{0.25} + 0.5\\right),\\ m_h(L) = 0.7\\,\\operatorname{clip}\\!\\left(\\tfrac{L - 0.667}{0.25} + 0.5\\right),\\ m_m = \\ldots",
        note: "L is the HSL lightness (max + min) / 2 of the pixel, from 0 to 1. The midtone mask is the product of the two rising and falling ramps.",
      },
      {
        name: "Shift",
        formula: "C' = \\operatorname{clip}\\left(C + m_s d_s + m_m d_m + m_h d_h\\right)",
        note: "For each channel C from 0 to 1. The shifts d come from the sliders divided by 100.",
      },
      ...(read.boolean(params, "preserveLuminosity", true)
        ? [{ name: "Keep lightness", formula: "L(C') \\leftarrow L(C)", note: "In HSL." }]
        : []),
    ],
  }),
};
