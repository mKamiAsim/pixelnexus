/**
 * Every browser filter, by catalog id. tools/check_catalog.py checks that each catalog entry
 * with engine "browser" and an implemented status is listed here.
 */
import { adaptiveSmoothingFilter } from "./adaptive/adaptive-smoothing";
import {
  localEntropyFilter,
  localRangeFilter,
  localStdFilter,
  localVarianceFilter,
} from "./adaptive/local-stats";
import { adaptiveLocalNoiseFilter, wienerAdaptiveFilter } from "./adaptive/local-noise";
import { madOutlierFilter } from "./adaptive/mad-outlier";
import { savgolFilter } from "./adaptive/savgol";
import { sigmaFilter } from "./adaptive/sigma";
import {
  enhancedLeeFilter,
  frostFilter,
  gammaMapFilter,
  kuanFilter,
  leeFilter,
} from "./adaptive/speckle";
import { sradFilter } from "./adaptive/srad";
import { freiChenFilter, kirschFilter, lineDetectorFilter, robinsonFilter } from "./edges/compass";
import { faridFilter, prewittFilter, robertsFilter, scharrFilter } from "./edges/gradients";
import { lawsFilter } from "./edges/laws";
import { cannyFilter, hysteresisFilter } from "./edges/hysteresis";
import { sobelNmsFilter } from "./edges/nms";
import { sobelFilter } from "./edges/sobel";
import { marrHildrethFilter, zeroCrossingFilter } from "./edges/zero-crossing";
import { gammaFilter } from "./enhancement/gamma";
import { grayscaleFilter } from "./enhancement/grayscale";
import { binomialFilter } from "./linear/binomial";
import { boxFilter } from "./linear/box";
import { diskAverageFilter } from "./linear/disk-average";
import { dogFilter, logFilter } from "./linear/dog-log";
import { firLowpassFilter } from "./linear/fir-lowpass";
import { fastFilter, harrisFilter, moravecFilter, shiTomasiFilter } from "./features/corners";
import { gaborBankFilter } from "./features/gabor-bank";
import { matchedVesselFilter } from "./features/matched-vessel";
import {
  butterworthBandpassFilter,
  butterworthBandrejectFilter,
  butterworthHighpassFilter,
  butterworthLowpassFilter,
  gaussianBandpassFilter,
  gaussianBandrejectFilter,
  gaussianHighpassFilter,
  gaussianLowpassFilter,
  idealBandpassFilter,
  idealBandrejectFilter,
  idealHighpassFilter,
  idealLowpassFilter,
} from "./frequency/passband";
import {
  combFilter,
  noisePeriodicFilter,
  notchPassFilter,
  notchRejectFilter,
  periodicNoiseFilter,
} from "./frequency/notch";
import {
  homomorphicFilter,
  logGaborFilter,
  phaseOnlyFilter,
  spectralWhiteningFilter,
  wienerDenoiseFilter,
} from "./frequency/shaping";
import { gaborFilter } from "./linear/gabor";
import {
  blackhatFilter,
  closingFilter,
  dilationFilter,
  erosionFilter,
  externalGradientFilter,
  internalGradientFilter,
  morphGradientFilter,
  openingFilter,
  tophatFilter,
} from "./morphology/gray";
import {
  asfFilter,
  closingByReconstructionFilter,
  geodesicFilter,
  levelingFilter,
  openingByReconstructionFilter,
  reconstructionFilter,
} from "./morphology/reconstruction";
import {
  cclFilter,
  convexHullFilter,
  hitOrMissFilter,
  pruningFilter,
  skeletonFilter,
  thickeningFilter,
  thinningFilter,
} from "./morphology/binary";
import { steerableFilter } from "./linear/steerable";
import { gaussianFilter } from "./linear/gaussian";
import { highBoostFilter, highPassFilter } from "./linear/high-pass";
import { laplacianFilter } from "./linear/laplacian";
import { laplacianSharpenFilter } from "./linear/laplacian-sharpen";
import { motionBlurFilter } from "./linear/motion-blur";
import { triangularFilter } from "./linear/triangular";
import { unsharpMaskFilter } from "./linear/unsharp-mask";
import { weightedAverageFilter } from "./linear/weighted-average";
import { adaptiveMedianFilter } from "./nonlinear/adaptive-median";
import { bilateralFilter, jointBilateralFilter } from "./nonlinear/bilateral";
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
import {
  gaussianNoiseFilter,
  poissonNoiseFilter,
  saltPepperNoiseFilter,
  speckleNoiseFilter,
} from "./utility/noise";

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
  prewittFilter,
  scharrFilter,
  robertsFilter,
  faridFilter,
  kirschFilter,
  robinsonFilter,
  freiChenFilter,
  lineDetectorFilter,
  lawsFilter,
  laplacianFilter,
  dogFilter,
  logFilter,
  zeroCrossingFilter,
  marrHildrethFilter,
  sobelNmsFilter,
  hysteresisFilter,
  cannyFilter,
  gaborFilter,
  gaborBankFilter,
  steerableFilter,
  matchedVesselFilter,
  harrisFilter,
  shiTomasiFilter,
  moravecFilter,
  fastFilter,
  erosionFilter,
  dilationFilter,
  openingFilter,
  closingFilter,
  morphGradientFilter,
  internalGradientFilter,
  externalGradientFilter,
  tophatFilter,
  blackhatFilter,
  reconstructionFilter,
  openingByReconstructionFilter,
  closingByReconstructionFilter,
  geodesicFilter,
  asfFilter,
  levelingFilter,
  hitOrMissFilter,
  thinningFilter,
  thickeningFilter,
  skeletonFilter,
  pruningFilter,
  convexHullFilter,
  cclFilter,
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
  notchRejectFilter,
  notchPassFilter,
  combFilter,
  periodicNoiseFilter,
  homomorphicFilter,
  phaseOnlyFilter,
  spectralWhiteningFilter,
  logGaborFilter,
  wienerDenoiseFilter,
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
  jointBilateralFilter,
  guidedFilter,
  anisotropicDiffusionFilter,
  vectorAnisotropicDiffusionFilter,
  localVarianceFilter,
  localStdFilter,
  localRangeFilter,
  localEntropyFilter,
  savgolFilter,
  wienerAdaptiveFilter,
  adaptiveLocalNoiseFilter,
  sigmaFilter,
  adaptiveSmoothingFilter,
  leeFilter,
  enhancedLeeFilter,
  kuanFilter,
  frostFilter,
  gammaMapFilter,
  sradFilter,
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
  speckleNoiseFilter,
  poissonNoiseFilter,
  noisePeriodicFilter,
];

const byId = new Map(BROWSER_FILTERS.map((filter) => [filter.id, filter]));

export function browserFilter(id: string): BrowserFilter | undefined {
  return byId.get(id);
}

export function hasBrowserFilter(id: string): boolean {
  return byId.has(id);
}
