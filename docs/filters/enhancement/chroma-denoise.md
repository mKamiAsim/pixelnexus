# Chroma denoising

--8<-- "filters/chroma-denoise-facts.md"

## Overview

Noise in color photos often shows as colored blotches. Chroma denoising splits each pixel into brightness and two color differences, smooths only the color differences, and keeps the brightness. Detail lives mostly in brightness, so it stays sharp.

<figure markdown="span">
  ![Three panels: a chart of colored and gray patches, the same chart with strong colored noise, and the chart after chroma denoising, with most colored speckles gone, clean patch edges, and some grain left in brightness.](../../assets/figures/chroma-denoise-light.svg#only-light){ width="560" }
  ![Three panels: a chart of colored and gray patches, the same chart with strong colored noise, and the chart after chroma denoising, with most colored speckles gone, clean patch edges, and some grain left in brightness.](../../assets/figures/chroma-denoise-dark.svg#only-dark){ width="560" }
  <figcaption>The patch chart with color noise, and after chroma denoising with a 5 x 5 median.</figcaption>
</figure>

## How it works

1. Convert each pixel to luma Y and the color differences Cb and Cr.
2. Smooth Cb and Cr with a median or a Gaussian.
3. Convert back to red, green and blue with the original Y.

## Mathematical foundation

--8<-- "filters/chroma-denoise-formula.md"

The conversion is linear and has an exact inverse, so with no smoothing the image comes back unchanged. Since Y is kept, every pixel keeps its luma, and only its color moves toward that of its neighbors. A median keeps the boundary between two colored areas where it is. A Gaussian mixes the colors on both sides, so a color can bleed a few pixels into its neighbor.

## Kernel or operator

The Inspector shows the conversion, the smoothing of Cb and Cr and the conversion back, with the current settings.

## Algorithm

--8<-- "filters/chroma-denoise-steps.md"

## Parameters

--8<-- "filters/chroma-denoise-params.md"

## Implementation

`chromaDenoiseFilter` in `web/src/core/filters/enhancement/chroma.ts` uses `medianPlane` of the median filter and the Gaussian kernel of the Gaussian blur.

## Worked example

--8<-- "examples/chroma-denoise.md"

The median almost halves the chroma error. The Gaussian lowers the noise within each patch, but it bleeds color across the patch edges. On this chart of small patches, its error ends higher than that of the noisy image. That is why the median is the default.

## Complexity

--8<-- "filters/chroma-denoise-complexity.md"

## Artifacts and limitations

--8<-- "filters/chroma-denoise-limits.md"

## Tests

The fixture cases smooth BT.601 Cb and Cr with scipy.ndimage.median_filter and gaussian_filter for four border modes. Unit tests check that the luma of every pixel stays and that a gray image stays as it is.

--8<-- "filters/chroma-denoise-tests.md"

## References

--8<-- "filters/chroma-denoise-references.md"
