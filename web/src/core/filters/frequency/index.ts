/**
 * The responses of the frequency filters, by catalog id. The Frequency explorer and the Spectrum
 * panel draw them with the same functions the filters run.
 */
import type { Plane } from "@/core/filters/planes";
import type { Params } from "@/core/filters/types";

import { notchResponses } from "./notch";
import { passResponses } from "./passband";
import type { Response } from "./spectral";

type Builder = (params: Params, plane?: Plane) => Response | undefined;

const RESPONSES = new Map<string, Builder>([...passResponses, ...notchResponses]);

/**
 * The response of a frequency filter for its parameters, or undefined for other filters. Filters
 * whose response depends on the image, such as periodic noise suppression, need the plane they
 * filter.
 */
export function frequencyResponse(id: string, params: Params, plane?: Plane): Response | undefined {
  return RESPONSES.get(id)?.(params, plane);
}

export function hasFrequencyResponse(id: string): boolean {
  return RESPONSES.has(id);
}
