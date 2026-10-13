/**
 * The responses of the frequency filters, by catalog id. The Frequency explorer and the Spectrum
 * panel draw them with the same functions the filters run.
 */
import type { Params } from "@/core/filters/types";

import { passResponses } from "./passband";
import type { Response } from "./spectral";

const RESPONSES = new Map<string, (params: Params) => Response>([...passResponses]);

/** The response of a frequency filter for its parameters, or undefined for other filters. */
export function frequencyResponse(id: string, params: Params): Response | undefined {
  return RESPONSES.get(id)?.(params);
}

export function hasFrequencyResponse(id: string): boolean {
  return RESPONSES.has(id);
}
