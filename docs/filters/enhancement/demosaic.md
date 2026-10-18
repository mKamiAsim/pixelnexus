# Demosaicing

--8<-- "filters/demosaic-facts.md"

## Overview

Most camera sensors record only one color at each pixel, through a mosaic of red, green and blue filters called a Bayer pattern. Half of the pixels see green, a quarter red and a quarter blue. Demosaicing rebuilds the two missing colors at every pixel. This filter first makes the mosaic from a full color image, then rebuilds it, so you can compare the result with the original.

<figure markdown="span">
  ![Four panels: a gray Siemens star next to colored patches, the same image as a Bayer mosaic of red, green and blue dots, the bilinear result with strong false colors in the star, and the Malvar-He-Cutler result with weaker false colors.](../../assets/figures/demosaic-light.svg#only-light){ width="640" }
  ![Four panels: a gray Siemens star next to colored patches, the same image as a Bayer mosaic of red, green and blue dots, the bilinear result with strong false colors in the star, and the Malvar-He-Cutler result with weaker false colors.](../../assets/figures/demosaic-dark.svg#only-dark){ width="640" }
  <figcaption>A gray Siemens star and color patches, their RGGB mosaic, and bilinear and Malvar-He-Cutler demosaicing.</figcaption>
</figure>

## How it works

1. Keep at each pixel only the color that the Bayer pattern puts there.
2. For each missing color, take the mean of the nearest pixels that recorded it.
3. With Malvar-He-Cutler, add a correction from how the recorded color changes around the pixel.

## Mathematical foundation

--8<-- "filters/demosaic-formula.md"

Bilinear interpolation treats the three colors as unrelated. But in natural images the colors change together: an edge in red is usually an edge in green too. Malvar, He and Cutler use this. Say the red value at a pixel is above the mean of the red values around it. Then green there is probably above its bilinear mean too, by about half as much. The Laplacian of the known channel measures that difference.

The 5 x 5 filters, with weights over 8, are these. For G at a red or blue pixel, the center is 4, the four axial neighbors 2, and the four pixels two steps away on the axes -1. For R at a green pixel with red to its left and right, those two red neighbors are 4 and the center is 5. The four diagonals are -1, the two pixels two steps left and right are -1, and the two pixels two steps up and down are 1/2. With red above and below, the filter is turned by 90 degrees. For R at a blue pixel, the center is 6, the four red diagonals 2, and the four pixels two steps away on the axes -3/2. Blue works the same way.

## Kernel or operator

The Inspector shows the mosaic step and the interpolation rule with the chosen pattern.

## Algorithm

--8<-- "filters/demosaic-steps.md"

## Parameters

--8<-- "filters/demosaic-params.md"

## Implementation

`demosaicFilter` in `web/src/core/filters/enhancement/demosaic.ts` holds the filters as lists of taps in `DEMOSAIC_TAPS`. The pattern comes from the image row and column, so tiles and the whole image agree.

## Worked example

--8<-- "examples/demosaic.md"

Malvar, He and Cutler report a gain of more than 5.5 dB over bilinear on the Kodak images. On this test image the gain is about 4 dB, and the false color in the gray star drops by more than a third.

## Complexity

--8<-- "filters/demosaic-complexity.md"

## Artifacts and limitations

--8<-- "filters/demosaic-limits.md"

## Tests

The fixture cases come from a NumPy reference with the same filters, for all four patterns and both methods, and for the mosaic view. Before the cases are written, the bilinear result is checked against OpenCV's Bayer conversion away from the edges, for all four patterns. Both methods must also give back an image whose channels change linearly across it. Unit tests check the pattern positions, that each filter's weights sum to 8, and the mosaic view.

--8<-- "filters/demosaic-tests.md"

## References

--8<-- "filters/demosaic-references.md"
