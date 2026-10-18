# Bilateral tone mapping

--8<-- "filters/bilateral-tonemap-facts.md"

## Overview

Durand and Dorsey split the log brightness of an image into two layers. The base layer is a bilateral filter of it: the broad areas of light, with sharp edges between them. The detail layer is what is left. Only the base is compressed, so a dark room and a bright window come closer together while the texture in both keeps its contrast.

<figure markdown="span">
  ![Two panels: a chart of colored and gray patches whose right half lies in deep shadow, almost black, and the same chart after tone mapping, with the shaded half much brighter and its patches clearly visible, and a sharp shadow edge.](../../assets/figures/bilateral-tonemap-light.svg#only-light){ width="480" }
  ![Two panels: a chart of colored and gray patches whose right half lies in deep shadow, almost black, and the same chart after tone mapping, with the shaded half much brighter and its patches clearly visible, and a sharp shadow edge.](../../assets/figures/bilateral-tonemap-dark.svg#only-dark){ width="480" }
  <figcaption>A scene with its right half in deep shadow, and after bilateral tone mapping with base contrast 5.</figcaption>
</figure>

## How it works

1. Compute the intensity of each pixel and keep its color ratios.
2. Take the log of the intensity and smooth it with a bilateral filter. This is the base layer.
3. Subtract the base from the log intensity. This is the detail layer.
4. Scale the base down to the target contrast, add the detail back, and restore the colors.

## Mathematical foundation

--8<-- "filters/bilateral-tonemap-formula.md"

In the log domain, a ratio of brightness is a difference. Scaling the base by c < 1 shrinks all large ratios, such as between light and shadow, by the same power. The detail D is added back unscaled, so small ratios, the texture, stay as they were. The bilateral filter makes this work at edges. It averages only pixels of a similar log intensity. So the step from shadow to light stays in the base and is compressed, instead of going into the detail and making a halo.

A brute-force bilateral filter with sigma_s at 2 percent of the image is slow. Durand and Dorsey's piecewise-linear version picks levels of log intensity sigma_r apart. For each level it computes a normalized Gaussian blur weighted by how close each pixel is to that level. Every pixel then mixes the results of the two levels next to its own value. The blurs can run on a smaller copy, every z-th pixel, while the final mixing uses every pixel. In PixelNexus the Gaussian is the exact one on the mirrored image, through the FFT of each row and column.

## Kernel or operator

The Inspector shows the four stages, from intensity to color, as formulas with the current settings.

## Algorithm

--8<-- "filters/bilateral-tonemap-steps.md"

## Parameters

--8<-- "filters/bilateral-tonemap-params.md"

## Implementation

`bilateralTonemapFilter` in `web/src/core/filters/enhancement/tonemap.ts` calls `bilateralTonemap`, which uses `piecewiseBilateral` for the base layer. The Gaussian is `mirrorGaussian` from the Retinex code. It is a global color filter, so it always sees the whole image.

## Worked example

--8<-- "examples/bilateral-tonemap.md"

The shaded half has a luma of 32 before the filter. With the default base contrast of 5 it rises to 155, while the lit half stays near 210. A lower base contrast brings the two halves closer.

## Complexity

--8<-- "filters/bilateral-tonemap-complexity.md"

## Artifacts and limitations

--8<-- "filters/bilateral-tonemap-limits.md"

## Tests

The fixture cases come from a NumPy reference of the same steps, with downsampling 1, 2 and 3, in linear light and on encoded values. Before the cases are written, the piecewise filter is checked against two limits: with a huge sigma_r it is the Gaussian blur, and two levels far apart stay apart. Unit tests check the same limits and that two flat areas 100 to 1 apart come out exactly at the target contrast of 5, with the brighter one white.

--8<-- "filters/bilateral-tonemap-tests.md"

## References

--8<-- "filters/bilateral-tonemap-references.md"
