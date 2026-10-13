/**
 * The Gabor filter bank. Catalog entry: catalog/filters/features/gabor-bank.yaml.
 *
 * The bank holds one Gabor filter for each pair of a scale and an orientation. Scale s has the
 * wavelength lambda_0 f^s, and orientation k the angle k 180 / n degrees. Sigma follows from the
 * half-response bandwidth b in octaves, as in skimage.filters.gabor_kernel:
 *
 *   sigma = lambda (1 / pi) sqrt(ln 2 / 2) (2^b + 1) / (2^b - 1)
 *
 * The plane is transformed once, and every filter of the bank correlates through that spectrum.
 * The output is the largest magnitude, the mean magnitude, or the angle of the filter with the
 * largest magnitude. For that angle, the first filter within a relative 1e-9 of the largest
 * magnitude wins, so exact ties, such as theta and 180 - theta next to a mirrored border, do not
 * depend on rounding.
 */
import { planeSpectrum } from "@/core/filters/convolve";
import { gaborKernels, type GaborSettings } from "@/core/filters/linear/gabor";
import { createPlane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** Sigma divided by the wavelength for a bandwidth in octaves. */
export function sigmaPerWavelength(bandwidth: number): number {
  const p = 2 ** bandwidth;
  return (Math.sqrt(Math.LN2 / 2) * (p + 1)) / (Math.PI * (p - 1));
}

/** Every filter of the bank, scale by scale, each with its angles in order. */
export function gaborBank(params: Params): GaborSettings[] {
  const wavelength = read.number(params, "wavelength", 4);
  const scales = Math.max(1, Math.round(read.number(params, "scales", 3)));
  const factor = read.number(params, "factor", 2);
  const orientations = Math.max(1, Math.round(read.number(params, "orientations", 4)));
  const ratio = sigmaPerWavelength(read.number(params, "bandwidth", 1));
  const aspect = read.number(params, "aspect", 1);
  const bank: GaborSettings[] = [];
  for (let s = 0; s < scales; s++) {
    const lambda = wavelength * factor ** s;
    for (let k = 0; k < orientations; k++) {
      bank.push({
        wavelength: lambda,
        angle: (k * 180) / orientations,
        sigma: lambda * ratio,
        aspect,
      });
    }
  }
  return bank;
}

/** The largest kernel half width in the bank. */
function bankReach(params: Params): number {
  return Math.max(
    ...gaborBank(params).map((settings) => {
      const { re } = gaborKernels(settings);
      return Math.max(re.anchorX, re.anchorY);
    }),
  );
}

type BankOutput = "max" | "mean" | "orientation";

export const gaborBankFilter: PlaneFilter = {
  id: "gabor-bank",
  kind: "derived",
  alphaWeighted: false,
  radius: bankReach,
  plane: (input, params, { border }) => {
    const output = read.string<BankOutput>(params, "output", "max");
    const bank = gaborBank(params);
    const spectrum = planeSpectrum(input, bankReach(params), border);
    const magnitudes = bank.map((settings) => {
      const { re, im } = gaborKernels(settings);
      const [a, b] = spectrum.correlate(re, im);
      return Float64Array.from(a.data, (v, i) => Math.hypot(v, b.data[i] ?? 0));
    });
    const n = input.width * input.height;
    const sum = new Float64Array(n);
    const largest = new Float64Array(n);
    for (const m of magnitudes) {
      for (let i = 0; i < n; i++) {
        const v = m[i] ?? 0;
        sum[i] = (sum[i] ?? 0) + v;
        if (v > (largest[i] ?? 0)) largest[i] = v;
      }
    }
    const out = createPlane(input.width, input.height);
    if (output === "mean") {
      for (let i = 0; i < n; i++) out.data[i] = (sum[i] ?? 0) / magnitudes.length;
    } else if (output === "max") {
      out.data.set(largest);
    } else {
      // Walk the bank backwards, so the first filter near the largest magnitude is written last.
      for (let f = magnitudes.length - 1; f >= 0; f--) {
        const m = magnitudes[f];
        const angle = bank[f]?.angle ?? 0;
        if (!m) continue;
        for (let i = 0; i < n; i++) {
          if ((m[i] ?? 0) >= (largest[i] ?? 0) * (1 - 1e-9)) out.data[i] = angle;
        }
      }
    }
    return out;
  },
  representation: (params) => {
    const bank = gaborBank(params);
    const wavelengths = [...new Set(bank.map((b) => b.wavelength))];
    const angles = [...new Set(bank.map((b) => b.angle))];
    const output = read.string<BankOutput>(params, "output", "max");
    const fmt = (v: number) => String(Number(v.toFixed(2)));
    return {
      kind: "stages",
      stages: [
        {
          name: "Bank",
          formula: `\\lambda_s \\in \\{${wavelengths.map(fmt).join(", ")}\\},\\quad \\theta_k \\in \\{${angles.map(fmt).join(", ")}\\}`,
          note: `${bank.length} Gabor filters. Sigma is ${fmt(sigmaPerWavelength(read.number(params, "bandwidth", 1)))} times the wavelength.`,
        },
        {
          name: "Responses",
          formula: "M_{s,k}(p) = \\left| (g_{s,k} \\star I)(p) \\right|",
          note: "The magnitude of each complex Gabor response. The kernels are on the Gabor filter page.",
        },
        {
          name: "Output",
          formula:
            output === "mean"
              ? "\\frac{1}{S K} \\sum_{s,k} M_{s,k}(p)"
              : output === "max"
                ? "\\max_{s,k} M_{s,k}(p)"
                : "\\theta_k \\text{ of } \\arg\\max_{s,k} M_{s,k}(p)",
        },
      ],
    };
  },
};
