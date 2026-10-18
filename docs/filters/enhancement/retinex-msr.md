# Multi-scale Retinex

--8<-- "filters/retinex-msr-facts.md"

## Overview

One Retinex scale cannot do everything. A small scale brings out detail but leaves halos and gray colors. A large scale keeps colors but evens out less light. Multi-scale Retinex averages three scales, 15, 80 and 250 pixels, as Jobson, Rahman and Woodell suggest.

With Apply to set to intensity, this is the MSRCP of Petro, Sbert and Morel. The Retinex runs on the intensity, and each pixel keeps its color ratios.

<figure markdown="span">
  ![Three panels: a chart of colored and gray patches that darkens from left to right, the chart after multi-scale Retinex on each channel, more even but with pale colors, and the chart after multi-scale Retinex on the intensity, with vivid colors and a darker right side.](../../assets/figures/retinex-msr-light.svg#only-light){ width="560" }
  ![Three panels: a chart of colored and gray patches that darkens from left to right, the chart after multi-scale Retinex on each channel, more even but with pale colors, and the chart after multi-scale Retinex on the intensity, with vivid colors and a darker right side.](../../assets/figures/retinex-msr-dark.svg#only-dark){ width="560" }
  <figcaption>The patch chart lit from the left, and multi-scale Retinex on each channel and on the intensity, shown at a quarter of its size.</figcaption>
</figure>

## How it works

1. Take the log of every value plus 1.
2. For each of the three scales, blur the image with that Gaussian and subtract the log of the blur.
3. Average the three results.
4. Stretch the average to 0 to 255, clipping a small percent of the values at each end.

## Mathematical foundation

--8<-- "filters/retinex-msr-formula.md"

Each scale removes the changes of light that are slower than it. The small scale removes the most, so it brings out the most detail, but it also removes the color of large areas. The large scale removes little, so it keeps the tone and the colors. The average is a trade-off between the two.

On each channel, the result shows a known weakness: where one color fills a large area, its channel is compared with its own average, and the color fades toward gray. The intensity mode avoids this. The Retinex of the intensity I = (R + G + B) / 3 is balanced to I_1. Then every channel of the pixel is scaled by A = min(255 / max(R, G, B), I_1 / I). The cap keeps every channel within 255.

## Kernel or operator

The Inspector shows the Retinex, the color balance and, with intensity, the color step, as formulas with the current settings.

## Algorithm

--8<-- "filters/retinex-msr-steps.md"

## Parameters

--8<-- "filters/retinex-msr-params.md"

## Implementation

`retinexMsrFilter` in `web/src/core/filters/enhancement/retinex.ts` calls `multiscaleRetinex` with three scales and `simplestColorBalance`. The Gaussian is `mirrorGaussian`, the exact Gaussian on the mirrored image through the FFT of each row and column. It is a global color filter, so it always sees the whole image.

## Worked example

--8<-- "examples/retinex-msr.md"

On each channel, multi-scale Retinex lifts the right quarter to 74 percent of the left and loses some saturation. On the intensity, the saturation stays close to that of the input, and the light is evened out less.

## Complexity

--8<-- "filters/retinex-msr-complexity.md"

## Artifacts and limitations

--8<-- "filters/retinex-msr-limits.md"

## Tests

The fixture cases come from a NumPy reference that follows the article, with the default scales and with smaller ones, on each channel and on the intensity. Before the cases are written, the blur is checked against scipy.ndimage.gaussian_filter with the reflect mode. Unit tests check that a flat image has no detail at all, and that a gain on I + 1 does not change the Retinex.

--8<-- "filters/retinex-msr-tests.md"

## References

--8<-- "filters/retinex-msr-references.md"
