# Notch-pass filter

--8<-- "filters/notch-pass-facts.md"

## Overview

The notch-pass filter keeps only small regions of the spectrum around chosen frequencies and removes the rest. Placed on the peaks of a periodic pattern, it extracts the pattern on its own. This shows what a notch-reject filter at the same place removes.

<figure markdown="span">
  ![Three panels: disks with diagonal stripes, the spectrum with the regions around the two peaks kept, and the result, which shows only the stripes on flat gray.](../../assets/figures/notch-pass-light.svg#only-light){ width="480" }
  ![Three panels: disks with diagonal stripes, the spectrum with the regions around the two peaks kept, and the result, which shows only the stripes on flat gray.](../../assets/figures/notch-pass-dark.svg#only-dark){ width="480" }
  <figcaption>A notch-pass filter at (0.1, 0.05) cycles per pixel keeps only the stripes.</figcaption>
</figure>

## How it works

1. Place notches on the peaks of the pattern.
2. The filter takes the spectrum of the image with the FFT.
3. It keeps the spectrum around each notch and its mirror points and sets the rest to 0.
4. It transforms back. Only the pattern remains, around 0.

## Mathematical foundation

--8<-- "filters/notch-pass-formula.md"

The notch-pass response is 1 minus the notch-reject response with the same notches. The two results add up to the image. The result has no mean brightness, so the output mapping shows 0 as gray 128 by default. The reflect and reflect 101 border modes mirror the image at its edges. So a pattern at (fx, fy) also shows up in the extension at (-fx, fy). For these modes each notch also acts at (-fx, fy) and (fx, -fy). The Spectrum panel draws those points as dashed rings.

## Kernel or operator

The operator is the response H. The Inspector draws it over the spectrum. The Spectrum panel tints what it removes, which is everything outside the notches.

## Algorithm

--8<-- "filters/notch-pass-steps.md"

## Parameters

--8<-- "filters/notch-pass-params.md"

## Implementation

`notchPassFilter` in `web/src/core/filters/frequency/notch.ts` builds H with `notchResponse`, and the functions in `web/src/core/filters/frequency/spectral.ts` filter the plane. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The spectrum of the extended image is multiplied by H.  The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/notch-pass.md"

## Complexity

--8<-- "filters/notch-pass-complexity.md"

## Artifacts and limitations

--8<-- "filters/notch-pass-limits.md"

## Tests

The reference builds the same product of high-pass factors with NumPy and filters the plane extended with `numpy.pad`. Before the cases are written, the script adds a wave to a smooth ramp. It checks that a Gaussian notch at the wave frequency leaves an error below 5 percent of the wave height in the center of the image. It does so for the reflect, wrap and reflect 101 modes.

--8<-- "filters/notch-pass-tests.md"

## References

--8<-- "filters/notch-pass-references.md"
