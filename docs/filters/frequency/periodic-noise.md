# Periodic-noise suppression

--8<-- "filters/periodic-noise-facts.md"

## Overview

Periodic-noise suppression removes stripes, moire and other periodic noise without placing notches by hand. It finds the peaks of the noise in the spectrum, the points that are much brighter than the rest of their ring, and removes each with a Gaussian notch. The rule for finding peaks is PixelNexus's own.

<figure markdown="span">
  ![Three panels: disks with diagonal stripes, the spectrum with the found peaks tinted red, and the result with the stripes gone.](../../assets/figures/periodic-noise-light.svg#only-light){ width="480" }
  ![Three panels: disks with diagonal stripes, the spectrum with the found peaks tinted red, and the result with the stripes gone.](../../assets/figures/periodic-noise-dark.svg#only-dark){ width="480" }
  <figcaption>Periodic noise suppression finds the peaks of the wave on its own and removes them.</figcaption>
</figure>

## How it works

1. Remove the mean of the image and fade it to 0 at the edges with a Hann window, so a pattern makes a sharp peak in the spectrum.
2. Find the points of the spectrum that are the largest in their 5 x 5 neighborhood and much brighter than the median of their ring.
3. Keep the strongest, up to the most peaks.
4. Remove them with Gaussian notches, as the notch-reject filter does.

## Mathematical foundation

--8<-- "filters/periodic-noise-formula.md"

The spectrum of a natural image falls off with frequency. A single threshold for the whole spectrum would miss weak peaks far from the center and find false ones near it. Comparing each point with the median of its ring, the frequencies at the same distance from the center, follows that fall-off. The median ignores the few bright peaks in a ring. The threshold is in natural log units, so 3 means a peak at least e^3, about 20, times the median. The window keeps the peak of a pattern compact, so the 5 x 5 test sees it as one maximum. The reflect and reflect 101 border modes mirror the image at its edges. So a pattern at (fx, fy) also shows up in the extension at (-fx, fy). For these modes each notch also acts at (-fx, fy) and (fx, -fy). The Spectrum panel draws those points as dashed rings.

## Kernel or operator

The peaks depend on the image, so the Inspector lists the four stages: the windowed spectrum, the peak test, the notches and the result. The Frequency explorer and the Spectrum panel show the notches found.

## Algorithm

--8<-- "filters/periodic-noise-steps.md"

## Parameters

--8<-- "filters/periodic-noise-params.md"

## Implementation

`periodicNoiseFilter` in `web/src/core/filters/frequency/notch.ts` finds the peaks with `windowedSpectrum` and `findPeaks`, then filters with Gaussian notches. Values within a relative 1e-9 count as equal, so mirror-image points of the spectrum, which differ only by rounding, are both found as peaks. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The spectrum of the extended image is multiplied by H.  The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result. A pattern that does not fit the image a whole number of times is cut off at the image edges. Its peak then leaks into nearby frequencies, so a little of the pattern stays near the edges.

## Worked example

--8<-- "examples/periodic-noise.md"

## Complexity

--8<-- "filters/periodic-noise-complexity.md"

## Artifacts and limitations

--8<-- "filters/periodic-noise-limits.md"

## Tests

The reference finds the peaks with the same rule in NumPy, with `numpy.hanning` for the window and the lower median of each ring. Before the cases are written, the script adds waves to a smooth ramp, one that fits the image a whole number of times and one that does not. It checks that the peaks are found next to the wave frequency. It also checks that the error left in the center of the image is below 5 percent of the wave height, for three border modes.

--8<-- "filters/periodic-noise-tests.md"

## References

--8<-- "filters/periodic-noise-references.md"
