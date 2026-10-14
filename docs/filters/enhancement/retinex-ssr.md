# Single-scale Retinex

--8<-- "filters/retinex-ssr-facts.md"

## Overview

Retinex removes slow changes of light. It compares each pixel with a wide Gaussian average of its surroundings, so a shadow that covers a large area cancels out, while edges and texture stay. The single-scale version uses one Gaussian. It is the base of the multi-scale Retinex and of MSRCR.

<figure markdown="span">
  ![Three panels: a chart of colored and gray patches that darkens from left to right, the chart after Retinex on each channel, much more even but with paler colors, and the chart after Retinex on the intensity, with its colors kept and a darker right side.](../../assets/figures/retinex-ssr-light.svg#only-light){ width="560" }
  ![Three panels: a chart of colored and gray patches that darkens from left to right, the chart after Retinex on each channel, much more even but with paler colors, and the chart after Retinex on the intensity, with its colors kept and a darker right side.](../../assets/figures/retinex-ssr-dark.svg#only-dark){ width="560" }
  <figcaption>The patch chart lit from the left, and single-scale Retinex on each channel and on the intensity, shown at a quarter of its size.</figcaption>
</figure>

## How it works

1. Take the log of every value plus 1.
2. Blur the image with a Gaussian of scale sigma, with the image mirrored at its edges.
3. Subtract the log of the blur from the log of the image.
4. Stretch the result to 0 to 255, clipping a small percent of the values at each end.

## Mathematical foundation

--8<-- "filters/retinex-ssr-formula.md"

A pixel's value is roughly the light falling on it times the reflectance of the surface. If the light changes slowly, the Gaussian average holds about the same light, and the ratio I / (G * I) keeps mostly the reflectance. The log of a ratio is a difference of logs. Retinex removes changes of light that are slower than sigma. Changes faster than sigma stay, so a sharp shadow edge remains.

The blur follows Algorithm 3 of Petro, Sbert and Morel. The image is mirrored into a grid of twice its size, which the FFT treats as periodic without jumps at the edges. Its spectrum is multiplied by exp(-2 pi^2 sigma^2 f^2), the Fourier transform of the Gaussian. PixelNexus does this on rows and then on columns. The result is the same, since both the Gaussian and the mirrored grid split into the two axes.

## Kernel or operator

The Inspector shows the Retinex, the color balance and, with intensity, the color step, as formulas with the current settings.

## Algorithm

--8<-- "filters/retinex-ssr-steps.md"

## Parameters

--8<-- "filters/retinex-ssr-params.md"

## Implementation

`retinexSsrFilter` in `web/src/core/filters/enhancement/retinex.ts` calls `multiscaleRetinex` with one scale and `simplestColorBalance`. The Gaussian is `mirrorGaussian`, which passes two rows or columns through one complex FFT. It is a global color filter, so it always sees the whole image.

## Worked example

--8<-- "examples/retinex-ssr.md"

On each channel, single-scale Retinex brings the right quarter to 83 percent of the left, and the colors fade a little. On the intensity, the saturation stays close to that of the input, but the light is evened out less.

## Complexity

--8<-- "filters/retinex-ssr-complexity.md"

## Artifacts and limitations

--8<-- "filters/retinex-ssr-limits.md"

## Tests

The fixture cases come from a NumPy reference that follows the article: the 2D FFT of the mirrored grid for the blur, and the sorting method of Simplest Color Balance. Before the cases are written, the blur is checked against scipy.ndimage.gaussian_filter with the reflect mode. Unit tests check the blur against the spatial Gaussian and that it keeps the image mean. They also check the positions of the clipped values, that a flat image turns mid gray, and that the intensity mode keeps each pixel's color ratios.

--8<-- "filters/retinex-ssr-tests.md"

## References

--8<-- "filters/retinex-ssr-references.md"
