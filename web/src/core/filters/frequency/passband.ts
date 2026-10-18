/**
 * Ideal, Butterworth and Gaussian low-pass, high-pass, band-pass and band-reject filters. Catalog
 * entries: catalog/filters/frequency/{ideal,butterworth,gaussian}-{lowpass,highpass,bandpass,
 * bandreject}.yaml.
 *
 * The responses follow Gonzalez and Woods, Digital Image Processing, chapter 4, with the distance
 * D from the center of the spectrum in cycles per pixel. A high-pass filter is 1 minus the
 * low-pass filter of the same kind, and a band-pass filter is 1 minus the band-reject filter.
 */
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import { frequencyFilter, sampleResponse, type Response } from "./spectral";

export type Shape = "ideal" | "butterworth" | "gaussian";
export type Band = "lowpass" | "highpass" | "bandpass" | "bandreject";

export interface PassSettings {
  readonly shape: Shape;
  readonly band: Band;
  /** The cutoff of a low-pass or high-pass filter, or the center of a band, in cycles per pixel. */
  readonly d0: number;
  /** The width of a band, in cycles per pixel. */
  readonly width: number;
  /** The order of a Butterworth filter. */
  readonly order: number;
}

/** The response of a low-pass, high-pass, band-pass or band-reject filter. */
export function passResponse({ shape, band, d0, width: w, order: n }: PassSettings): Response {
  const lowpass = (d: number): number => {
    if (shape === "ideal") return d <= d0 ? 1 : 0;
    if (shape === "butterworth") return 1 / (1 + (d / d0) ** (2 * n));
    return Math.exp(-(d * d) / (2 * d0 * d0));
  };
  const bandreject = (d: number): number => {
    if (shape === "ideal") return d >= d0 - w / 2 && d <= d0 + w / 2 ? 0 : 1;
    const q = d * d - d0 * d0;
    if (shape === "butterworth") return q === 0 ? 0 : 1 / (1 + ((d * w) / q) ** (2 * n));
    return d === 0 ? 1 : 1 - Math.exp(-((q / (d * w)) ** 2));
  };
  const radial =
    band === "lowpass"
      ? lowpass
      : band === "highpass"
        ? (d: number) => 1 - lowpass(d)
        : band === "bandreject"
          ? bandreject
          : (d: number) => 1 - bandreject(d);
  return (fx, fy) => radial(Math.sqrt(fx * fx + fy * fy));
}

export function passSettings(params: Params, shape: Shape, band: Band): PassSettings {
  const banded = band === "bandpass" || band === "bandreject";
  return {
    shape,
    band,
    d0: banded ? read.number(params, "center", 0.2) : read.number(params, "cutoff", 0.1),
    width: read.number(params, "width", 0.1),
    order: read.number(params, "order", 2),
  };
}

const LOW: Record<Shape, string> = {
  ideal: "\\begin{cases} 1 & D \\le D_0 \\\\ 0 & D > D_0 \\end{cases}",
  butterworth: "\\frac{1}{1 + (D / D_0)^{2n}}",
  gaussian: "e^{-D^2 / 2 D_0^2}",
};

const REJECT: Record<Shape, string> = {
  ideal:
    "\\begin{cases} 0 & D_0 - \\frac{W}{2} \\le D \\le D_0 + \\frac{W}{2} \\\\ 1 & \\text{otherwise} \\end{cases}",
  butterworth: "\\frac{1}{1 + \\left( \\frac{D W}{D^2 - D_0^2} \\right)^{2n}}",
  gaussian: "1 - e^{-\\left( \\frac{D^2 - D_0^2}{D W} \\right)^2}",
};

/** The response as LaTeX, with the current values. */
export function passFormula({ shape, band, d0, width, order }: PassSettings): string {
  const values = [`D_0 = ${d0}`];
  if (band === "bandpass" || band === "bandreject") values.push(`W = ${width}`);
  if (shape === "butterworth") values.push(`n = ${order}`);
  const body =
    band === "lowpass"
      ? LOW[shape]
      : band === "highpass"
        ? shape === "ideal"
          ? "\\begin{cases} 0 & D \\le D_0 \\\\ 1 & D > D_0 \\end{cases}"
          : `1 - ${LOW[shape]}`
        : band === "bandreject"
          ? REJECT[shape]
          : shape === "ideal"
            ? "\\begin{cases} 1 & D_0 - \\frac{W}{2} \\le D \\le D_0 + \\frac{W}{2} \\\\ 0 & \\text{otherwise} \\end{cases}"
            : shape === "gaussian"
              ? "e^{-\\left( \\frac{D^2 - D_0^2}{D W} \\right)^2}"
              : `1 - ${REJECT[shape]}`;
  return `H = ${body},\\quad ${values.join(",\\ ")}`;
}

function passFilter(shape: Shape, band: Band): Omit<PlaneFilter, "id"> {
  return {
    kind: band === "highpass" || band === "bandpass" ? "derived" : "smooth",
    alphaWeighted: false,
    global: true,
    radius: () => 0,
    plane: (input, params, { border }) =>
      frequencyFilter(input, border, passResponse(passSettings(params, shape, band))),
    representation: (params) => {
      const settings = passSettings(params, shape, band);
      return {
        kind: "frequency",
        formula: passFormula(settings),
        ...sampleResponse(passResponse(settings)),
        note: "D is the distance from the center of the spectrum, in cycles per pixel. The spectrum of the image, extended with the border mode, is multiplied by H and transformed back.",
      };
    },
  };
}

export const idealLowpassFilter: PlaneFilter = {
  ...passFilter("ideal", "lowpass"),
  id: "ideal-lowpass",
};
export const idealHighpassFilter: PlaneFilter = {
  ...passFilter("ideal", "highpass"),
  id: "ideal-highpass",
};
export const idealBandpassFilter: PlaneFilter = {
  ...passFilter("ideal", "bandpass"),
  id: "ideal-bandpass",
};
export const idealBandrejectFilter: PlaneFilter = {
  ...passFilter("ideal", "bandreject"),
  id: "ideal-bandreject",
};
export const butterworthLowpassFilter: PlaneFilter = {
  ...passFilter("butterworth", "lowpass"),
  id: "butterworth-lowpass",
};
export const butterworthHighpassFilter: PlaneFilter = {
  ...passFilter("butterworth", "highpass"),
  id: "butterworth-highpass",
};
export const butterworthBandpassFilter: PlaneFilter = {
  ...passFilter("butterworth", "bandpass"),
  id: "butterworth-bandpass",
};
export const butterworthBandrejectFilter: PlaneFilter = {
  ...passFilter("butterworth", "bandreject"),
  id: "butterworth-bandreject",
};
export const gaussianLowpassFilter: PlaneFilter = {
  ...passFilter("gaussian", "lowpass"),
  id: "gaussian-lowpass",
};
export const gaussianHighpassFilter: PlaneFilter = {
  ...passFilter("gaussian", "highpass"),
  id: "gaussian-highpass",
};
export const gaussianBandpassFilter: PlaneFilter = {
  ...passFilter("gaussian", "bandpass"),
  id: "gaussian-bandpass",
};
export const gaussianBandrejectFilter: PlaneFilter = {
  ...passFilter("gaussian", "bandreject"),
  id: "gaussian-bandreject",
};

export const passFilters: readonly PlaneFilter[] = [
  idealLowpassFilter,
  idealHighpassFilter,
  idealBandpassFilter,
  idealBandrejectFilter,
  butterworthLowpassFilter,
  butterworthHighpassFilter,
  butterworthBandpassFilter,
  butterworthBandrejectFilter,
  gaussianLowpassFilter,
  gaussianHighpassFilter,
  gaussianBandpassFilter,
  gaussianBandrejectFilter,
];

/** The response of each filter for its parameters, by catalog id. */
export const passResponses: ReadonlyMap<string, (params: Params) => Response> = new Map(
  passFilters.map((filter) => {
    const [shape, band] = filter.id.split("-") as [Shape, Band];
    return [filter.id, (params: Params) => passResponse(passSettings(params, shape, band))];
  }),
);
