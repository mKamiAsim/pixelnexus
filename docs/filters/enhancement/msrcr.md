# Multi-scale Retinex with color restoration

--8<-- "filters/msrcr-facts.md"

## Overview

Multi-scale Retinex on each channel makes colors grayer. Jobson, Rahman and Woodell added a color restoration step that multiplies each channel's Retinex by the log of that channel's share of the pixel. Strong colors get a larger factor, so some of the color comes back.

<figure markdown="span">
  ![Three panels: a chart of colored and gray patches that darkens from left to right, the chart after multi-scale Retinex on each channel, and the chart after MSRCR, both much more even, with MSRCR a little more colorful.](../../assets/figures/msrcr-light.svg#only-light){ width="560" }
  ![Three panels: a chart of colored and gray patches that darkens from left to right, the chart after multi-scale Retinex on each channel, and the chart after MSRCR, both much more even, with MSRCR a little more colorful.](../../assets/figures/msrcr-dark.svg#only-dark){ width="560" }
  <figcaption>The patch chart lit from the left, multi-scale Retinex, and MSRCR with color restoration, shown at a quarter of its size.</figcaption>
</figure>

## How it works

1. Compute the multi-scale Retinex of each channel with the three scales.
2. Find each channel's share of the pixel's total.
3. Multiply the channel's Retinex by the log of alpha times that share.
4. Stretch each channel to 0 to 255, clipping a small percent of the values at each end.

## Mathematical foundation

--8<-- "filters/msrcr-formula.md"

The factor log(alpha I_c) - log of the sum is the log of alpha times the channel's share. A gray pixel has a share of 1 / 3 in every channel, so all three get the same factor. In a red pixel, red has the largest share and the largest factor, so red stays strong after the stretch.

Petro, Sbert and Morel point out a risk. Where a channel is near 0, its Retinex is negative and so is its factor, and the product turns positive. After the stretch, that channel can come out bright, so a deep blue can turn magenta. For such images, Multi-scale Retinex on the intensity keeps the colors safely.

## Kernel or operator

The Inspector shows the Retinex, the color restoration and the color balance as formulas with the current settings.

## Algorithm

--8<-- "filters/msrcr-steps.md"

## Parameters

--8<-- "filters/msrcr-params.md"

## Implementation

`msrcrFilter` in `web/src/core/filters/enhancement/retinex.ts` computes the factor for each channel and pixel, and passes it to the same Retinex and color balance code as Multi-scale Retinex. It is a global color filter, so it always sees the whole image.

## Worked example

--8<-- "examples/msrcr.md"

On this chart, MSRCR keeps a little more saturation than multi-scale Retinex on each channel, and it evens out the light a little less. Multi-scale Retinex on the intensity keeps almost all of it.

## Complexity

--8<-- "filters/msrcr-complexity.md"

## Artifacts and limitations

--8<-- "filters/msrcr-limits.md"

## Tests

The fixture cases come from a NumPy reference that follows Algorithm 1 of Petro, Sbert and Morel, with the default constants and with smaller scales and another alpha. Before the cases are written, the blur is checked against scipy.ndimage.gaussian_filter with the reflect mode.

--8<-- "filters/msrcr-tests.md"

## References

--8<-- "filters/msrcr-references.md"
