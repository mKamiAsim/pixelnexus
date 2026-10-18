# Comb filter

--8<-- "filters/comb-facts.md"

## Overview

The comb filter removes a periodic pattern together with its harmonics. A pattern with sharp edges, such as bars or scan lines, is not a pure wave. It makes peaks at a base frequency and at whole multiples of it. The comb places a notch on each multiple, so one setting removes the whole pattern.

<figure markdown="span">
  ![Three panels: disks with vertical bars every 8 pixels, the spectrum with notches on a row of peaks, and the result with the bars gone.](../../assets/figures/comb-light.svg#only-light){ width="480" }
  ![Three panels: disks with vertical bars every 8 pixels, the spectrum with notches on a row of peaks, and the result with the bars gone.](../../assets/figures/comb-dark.svg#only-dark){ width="480" }
  <figcaption>Bars every 8 pixels make peaks at 0.125 and 0.375 cycles per pixel. A comb with 3 harmonics removes them.</figcaption>
</figure>

## How it works

1. Read the base frequency of the pattern in the Spectrum panel.
2. The filter places notches at 1, 2, 3 and more times that frequency, up to the chosen count.
3. It removes those regions of the spectrum, with their mirror points, and transforms back.

## Mathematical foundation

--8<-- "filters/comb-formula.md"

Bars of 4 light and 4 dark pixels form a square wave with period 8. A square wave holds the odd harmonics of its base frequency, here 0.125, 0.375 and so on, with falling strength. The comb is a notch-reject filter with notches at k times the base frequency, as long as both parts stay within 0.5 cycles per pixel. Placing the notches on harmonics is this filter's own convenience. The reflect and reflect 101 border modes mirror the image at its edges. So a pattern at (fx, fy) also shows up in the extension at (-fx, fy). For these modes each notch also acts at (-fx, fy) and (fx, -fy). The Spectrum panel draws those points as dashed rings.

## Kernel or operator

The operator is the response H with its row of notches. The Inspector draws it, and the Spectrum panel tints it on the spectrum of the image.

## Algorithm

--8<-- "filters/comb-steps.md"

## Parameters

--8<-- "filters/comb-params.md"

## Implementation

`combFilter` in `web/src/core/filters/frequency/notch.ts` lists the harmonics with `harmonics` and builds H with `notchResponse`. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The spectrum of the extended image is multiplied by H.  The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result. A pattern that does not fit the image a whole number of times is cut off at the image edges. Its peak then leaks into nearby frequencies, so a little of the pattern stays near the edges.

## Worked example

--8<-- "examples/comb.md"

## Complexity

--8<-- "filters/comb-complexity.md"

## Artifacts and limitations

--8<-- "filters/comb-limits.md"

## Tests

The reference lists the same harmonics and builds the same product with NumPy. The cases cover an oblique base frequency, a vertical one and three notch shapes.

--8<-- "filters/comb-tests.md"

## References

--8<-- "filters/comb-references.md"
