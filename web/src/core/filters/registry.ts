/**
 * Every browser filter, by catalog id. tools/check_catalog.py checks that each catalog entry
 * with engine "browser" and an implemented status is listed here.
 */
import { madOutlierFilter } from "./adaptive/mad-outlier";
import { sobelFilter } from "./edges/sobel";
import { gammaFilter } from "./enhancement/gamma";
import { grayscaleFilter } from "./enhancement/grayscale";
import { binomialFilter } from "./linear/binomial";
import { boxFilter } from "./linear/box";
import { diskAverageFilter } from "./linear/disk-average";
import { firLowpassFilter } from "./linear/fir-lowpass";
import { gaussianFilter } from "./linear/gaussian";
import { highBoostFilter, highPassFilter } from "./linear/high-pass";
import { laplacianFilter } from "./linear/laplacian";
import { laplacianSharpenFilter } from "./linear/laplacian-sharpen";
import { motionBlurFilter } from "./linear/motion-blur";
import { triangularFilter } from "./linear/triangular";
import { unsharpMaskFilter } from "./linear/unsharp-mask";
import { weightedAverageFilter } from "./linear/weighted-average";
import { adaptiveMedianFilter } from "./nonlinear/adaptive-median";
import { bilateralFilter } from "./nonlinear/bilateral";
import {
  anisotropicDiffusionFilter,
  vectorAnisotropicDiffusionFilter,
} from "./nonlinear/diffusion";
import { guidedFilter } from "./nonlinear/guided";
import {
  alphaTrimmedMeanFilter,
  contraharmonicMeanFilter,
  geometricMeanFilter,
  harmonicMeanFilter,
} from "./nonlinear/means";
import { medianFilter } from "./nonlinear/median";
import { maxFilter, midpointFilter, minFilter } from "./nonlinear/min-max";
import { modeFilter } from "./nonlinear/mode";
import { rankOrderFilter } from "./nonlinear/rank-order";
import { kuwaharaFilter, nagaoMatsuyamaFilter } from "./nonlinear/subregions";
import { switchingMedianFilter } from "./nonlinear/switching-median";
import { vectorMedianFilter } from "./nonlinear/vector-median";
import { weightedMedianFilter } from "./nonlinear/weighted-median";
import { deadPixelFilter } from "./restoration/dead-pixel";
import type { BrowserFilter } from "./types";
import { gaussianNoiseFilter, saltPepperNoiseFilter } from "./utility/noise";

export const BROWSER_FILTERS: readonly BrowserFilter[] = [
  boxFilter,
  gaussianFilter,
  weightedAverageFilter,
  binomialFilter,
  triangularFilter,
  diskAverageFilter,
  firLowpassFilter,
  motionBlurFilter,
  sobelFilter,
  laplacianFilter,
  medianFilter,
  weightedMedianFilter,
  adaptiveMedianFilter,
  switchingMedianFilter,
  vectorMedianFilter,
  deadPixelFilter,
  madOutlierFilter,
  kuwaharaFilter,
  nagaoMatsuyamaFilter,
  bilateralFilter,
  guidedFilter,
  anisotropicDiffusionFilter,
  vectorAnisotropicDiffusionFilter,
  minFilter,
  maxFilter,
  midpointFilter,
  rankOrderFilter,
  modeFilter,
  alphaTrimmedMeanFilter,
  geometricMeanFilter,
  harmonicMeanFilter,
  contraharmonicMeanFilter,
  unsharpMaskFilter,
  laplacianSharpenFilter,
  highPassFilter,
  highBoostFilter,
  gammaFilter,
  grayscaleFilter,
  gaussianNoiseFilter,
  saltPepperNoiseFilter,
];

const byId = new Map(BROWSER_FILTERS.map((filter) => [filter.id, filter]));

export function browserFilter(id: string): BrowserFilter | undefined {
  return byId.get(id);
}

export function hasBrowserFilter(id: string): boolean {
  return byId.has(id);
}
