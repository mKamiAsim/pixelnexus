# Grayscale conversion

--8<-- "filters/grayscale-facts.md"

## Overview

Grayscale conversion turns each pixel into one gray value, a weighted sum of its red, green and blue values. Green counts most and blue least, as for the human eye.

<figure markdown="span">
  ![Four panels: a sweep of hues from full color to white, and its grayscale versions with BT.709 luma, BT.601 luma and luminance.](../../assets/figures/grayscale-light.svg#only-light){ width="480" }
  ![Four panels: a sweep of hues from full color to white, and its grayscale versions with BT.709 luma, BT.601 luma and luminance.](../../assets/figures/grayscale-dark.svg#only-dark){ width="480" }
  <figcaption>The three methods give different grays for the same saturated colors.</figcaption>
</figure>

## How it works

1. Read the red, green and blue values of the pixel.
2. Multiply each by its weight and add the three results.
3. Write the sum to all three channels.

## Mathematical foundation

--8<-- "filters/grayscale-formula.md"

Luma is a weighted sum of the stored, gamma-encoded values. Luminance is the same weighted sum on linear light values, which measures light more faithfully. For grays the two agree, because all three channels are equal. For saturated colors they differ a lot, as the worked example shows.

## Kernel or operator

The conversion has no kernel. The Inspector shows the three weights and whether they apply to encoded or linear values. The weights of the two luma standards:

--8<-- "kernels/grayscale.md"

## Algorithm

--8<-- "filters/grayscale-steps.md"

## Parameters

--8<-- "filters/grayscale-params.md"

## Implementation

`grayValue` computes the gray value of one pixel. The luminance method decodes each channel from sRGB with the IEC 61966-2-1 formula, sums, and encodes the result again. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/grayscale.md"

## Complexity

--8<-- "filters/grayscale-complexity.md"

## Artifacts and limitations

--8<-- "filters/grayscale-limits.md"

## Tests

All three methods are compared with NumPy versions of the formulas on 24 random colors, within 1e-5. The fixture generator also checks the BT.601 weights against OpenCV's color conversion, allowing one level for OpenCV's fixed-point rounding.

--8<-- "filters/grayscale-tests.md"

## References

--8<-- "filters/grayscale-references.md"
