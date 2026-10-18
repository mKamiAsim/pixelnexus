# Free rotation

--8<-- "filters/rotate-free-facts.md"

## Overview

Free rotation turns the image by any angle around its center. Open it with **Image > Rotate by angle**. Positive angles turn counterclockwise. The image can grow to hold the turned corners, or keep its size and crop them. The new corners are transparent, white or black.

<figure markdown="span">
  ![Three close-ups of a checkerboard turned by 30 degrees. With nearest neighbor the square edges are jagged steps. With bilinear and bicubic the edges are smooth, and bicubic is a little crisper.](../../assets/figures/rotate-free-light.svg#only-light){ width="480" }
  ![Three close-ups of a checkerboard turned by 30 degrees. With nearest neighbor the square edges are jagged steps. With bilinear and bicubic the edges are smooth, and bicubic is a little crisper.](../../assets/figures/rotate-free-dark.svg#only-dark){ width="480" }
  <figcaption>Nearest neighbor leaves jagged edges. Bilinear and bicubic read between pixels and smooth them.</figcaption>
</figure>

## How it works

1. For each new pixel, turn its position back by the angle into the old image.
2. That spot usually falls between old pixels.
3. Read a value there: copy the nearest pixel, or mix the 4 or 16 pixels around it.
4. Where the spot falls outside the old image, the new pixel is transparent, then gets the fill color.

## Mathematical foundation

--8<-- "filters/rotate-free-formula.md"

This is inverse mapping. Mapping forward, from source to output, would leave holes between the turned pixels and pile several pixels onto others. Mapping back gives every output pixel exactly one value.

Bilinear interpolation at the source position \((u, v)\) mixes the 4 surrounding pixels with the weights \((1 - \alpha)(1 - \beta)\), \(\alpha (1 - \beta)\), \((1 - \alpha)\beta\) and \(\alpha \beta\), where \(\alpha\) and \(\beta\) are the fractional parts of \(u\) and \(v\). Bicubic interpolation mixes the 16 surrounding pixels with the product of two Keys kernels, as in [Resize](resize.md). Nearest neighbor takes the pixel whose center is closest.

Colors are multiplied by alpha before mixing. Outside the image the premultiplied values are 0, so the edge of the turned image fades into the transparent corners without a dark fringe.

## Kernel or operator

Free rotation has no kernel of its own. It reads values with the interpolation kernels shown on the [Resize](resize.md#kernel-or-operator) page, without the stretch, because rotation does not change the pixel spacing.

## Algorithm

--8<-- "filters/rotate-free-steps.md"

## Parameters

--8<-- "filters/rotate-free-params.md"

## Implementation

`rotateImage` in `web/src/core/image/resample.ts` computes the output size, maps each output center back and samples there in floating point. The output size that holds the whole image is \(\lceil W |\cos\theta| + H |\sin\theta| \rceil\) by \(\lceil W |\sin\theta| + H |\cos\theta| \rceil\), so turns by 90 degrees keep the exact size. The selection turns with the image, and its new corners are always unselected.

Like Resize, free rotation changes the image size, so its catalog entry names the command `image.rotate-free` instead of running in the filter engine.

## Worked example

--8<-- "examples/rotate-free.md"

## Complexity

--8<-- "filters/rotate-free-complexity.md"

## Artifacts and limitations

--8<-- "filters/rotate-free-limits.md"

## Tests

The reference is a NumPy version of the same definitions in `tools/fixtures_geometry.py`. The fixture script checks its bilinear and nearest results against `scipy.ndimage.map_coordinates` with orders 1 and 0 and zero padding. The test compares six rotations, with every interpolation, both canvas options and three fills, within 1 level. Other tests check exact quarter turns and the fill colors.

--8<-- "filters/rotate-free-tests.md"

## References

--8<-- "filters/rotate-free-references.md"
