# Sobel

--8<-- "filters/sobel-facts.md"

## Overview

The Sobel operator measures how fast brightness changes at each pixel, and in which direction. Its two kernels combine a difference across the edge with a small average along it, which makes it less sensitive to noise than plain differences.

<figure markdown="span">
  ![Four panels: an image of disks, its horizontal Sobel response, its vertical Sobel response, and the gradient magnitude.](../../assets/figures/sobel-light.svg#only-light){ width="480" }
  ![Four panels: an image of disks, its horizontal Sobel response, its vertical Sobel response, and the gradient magnitude.](../../assets/figures/sobel-dark.svg#only-dark){ width="480" }
  <figcaption>Gx responds to left-right changes, Gy to up-down changes, and the magnitude to both.</figcaption>
</figure>

## How it works

1. Look at the 3x3 window around the pixel.
2. Subtract the left column from the right column, counting the middle row twice. This is Gx.
3. Subtract the top row from the bottom row, counting the middle column twice. This is Gy.
4. Combine Gx and Gy into one strength, the magnitude, and one direction.

## Mathematical foundation

--8<-- "filters/sobel-formula.md"

Gx and Gy approximate the partial derivatives of a slightly smoothed image. Both are linear filters. The magnitude and the direction combine them in a nonlinear way. The direction is measured from the x axis toward the y axis, which points down in images, and it points from dark to bright.

## Kernel or operator

The two kernels, and their separable factors. The filter runs the factors as two 1D passes.

--8<-- "kernels/sobel.md"

## Algorithm

--8<-- "filters/sobel-steps.md"

## Parameters

--8<-- "filters/sobel-params.md"

## Implementation

`sobelGradients` runs two separable passes for each kernel. `sobelKernels` builds the 3x3 matrices from the same factors for the Inspector. By default the filter works on luma and gives a gray result. Gx and Gy are signed, so the output mapping turns them into pixel values. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/sobel.md"

## Complexity

--8<-- "filters/sobel-complexity.md"

## Artifacts and limitations

--8<-- "filters/sobel-limits.md"

## Tests

Gx, Gy, both magnitudes and the direction are compared with `scipy.ndimage.sobel` for all five border modes, within 1e-4 relative to the value. The fixture generator also checks SciPy against OpenCV's Sobel before it writes the reference.

--8<-- "filters/sobel-tests.md"

## References

--8<-- "filters/sobel-references.md"
