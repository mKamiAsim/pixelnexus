# Notch-reject filter

--8<-- "filters/notch-reject-facts.md"

## Overview

The notch-reject filter removes small regions of the spectrum around chosen frequencies. A periodic pattern, such as stripes or moire, makes bright peaks in the spectrum. Notches on those peaks remove the pattern and leave the rest of the image almost unchanged. Click a peak in the Spectrum panel to place a notch.

<figure markdown="span">
  ![Three panels: disks with diagonal stripes, the spectrum with two bright peaks tinted red by the notches, and the result with the stripes gone.](../../assets/figures/notch-reject-light.svg#only-light){ width="480" }
  ![Three panels: disks with diagonal stripes, the spectrum with two bright peaks tinted red by the notches, and the result with the stripes gone.](../../assets/figures/notch-reject-dark.svg#only-dark){ width="480" }
  <figcaption>A Gaussian notch at (0.1, 0.05) cycles per pixel removes the stripes.</figcaption>
</figure>

## How it works

1. Find the peaks of the pattern in the Spectrum panel and place a notch on each.
2. The filter takes the spectrum of the image with the FFT.
3. It sets the spectrum to 0 around each notch and its mirror points, with smooth or sharp edges.
4. It transforms back. The pattern is gone.

## Mathematical foundation

--8<-- "filters/notch-reject-formula.md"

Each notch is a high-pass filter H_k centered at its frequency. The response is the product of all of them, as in Gonzalez and Woods. A real image has a symmetric spectrum, so a pattern at (fx, fy) also shows at (-fx, -fy), and each notch acts at both points. The reflect and reflect 101 border modes mirror the image at its edges. So a pattern at (fx, fy) also shows up in the extension at (-fx, fy). For these modes each notch also acts at (-fx, fy) and (fx, -fy). The Spectrum panel draws those points as dashed rings.

## Kernel or operator

The operator is the response H. The Inspector draws it over the spectrum, with frequency 0 in the center. The Spectrum panel tints what it removes on the spectrum of the image itself.

## Algorithm

--8<-- "filters/notch-reject-steps.md"

## Parameters

--8<-- "filters/notch-reject-params.md"

## Implementation

`notchRejectFilter` in `web/src/core/filters/frequency/notch.ts` builds H with `notchResponse`, and the functions in `web/src/core/filters/frequency/spectral.ts` filter the plane. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The spectrum of the extended image is multiplied by H.  The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result. A pattern that does not fit the image a whole number of times is cut off at the image edges. Its peak then leaks into nearby frequencies, so a little of the pattern stays near the edges.

## Worked example

--8<-- "examples/notch-reject.md"

## Complexity

--8<-- "filters/notch-reject-complexity.md"

## Artifacts and limitations

--8<-- "filters/notch-reject-limits.md"

## Tests

The reference builds the same product of high-pass factors with NumPy and filters the plane extended with `numpy.pad`. Before the cases are written, the script adds a wave to a smooth ramp. It checks that a Gaussian notch at the wave frequency leaves an error below 5 percent of the wave height in the center of the image. It does so for the reflect, wrap and reflect 101 modes.

--8<-- "filters/notch-reject-tests.md"

## References

--8<-- "filters/notch-reject-references.md"
