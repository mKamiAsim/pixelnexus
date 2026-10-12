/**
 * Every browser filter, by catalog id. tools/check_catalog.py checks that each catalog entry
 * with engine "browser" and an implemented status is listed here.
 */
import { sobelFilter } from "./edges/sobel";
import { gammaFilter } from "./enhancement/gamma";
import { grayscaleFilter } from "./enhancement/grayscale";
import { boxFilter } from "./linear/box";
import { gaussianFilter } from "./linear/gaussian";
import { laplacianFilter } from "./linear/laplacian";
import { motionBlurFilter } from "./linear/motion-blur";
import { unsharpMaskFilter } from "./linear/unsharp-mask";
import { medianFilter } from "./nonlinear/median";
import type { BrowserFilter } from "./types";
import { gaussianNoiseFilter, saltPepperNoiseFilter } from "./utility/noise";

export const BROWSER_FILTERS: readonly BrowserFilter[] = [
  boxFilter,
  gaussianFilter,
  motionBlurFilter,
  sobelFilter,
  laplacianFilter,
  medianFilter,
  unsharpMaskFilter,
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
