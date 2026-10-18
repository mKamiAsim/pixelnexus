# Box filter

--8<-- "filters/box-facts.md"

## Overview

The box filter replaces each pixel with the plain average of a square window. It is the simplest blur, and with running sums also the fastest. It is a good baseline to compare other blurs with.

<figure markdown="span">
  ![Three panels: a zone plate, the same zone plate after a 9x9 box filter, and after a Gaussian blur with sigma 2.](../../assets/figures/box-light.svg#only-light){ width="480" }
  ![Three panels: a zone plate, the same zone plate after a 9x9 box filter, and after a Gaussian blur with sigma 2.](../../assets/figures/box-dark.svg#only-dark){ width="480" }
  <figcaption>A 9x9 box filter turns some fine rings of a zone plate into rings of reversed contrast. A Gaussian blur fades them out instead.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel. Its width is the window size.
2. Add up every value in the window.
3. Divide by the number of pixels in the window.
4. Write the result as the new pixel value. Do this for every pixel and channel.

## Mathematical foundation

--8<-- "filters/box-formula.md"

All weights are equal, so the box filter is a moving average. Its frequency response is a product of two sinc-shaped curves. They have negative side lobes, which is why some fine patterns come back with reversed contrast, as in the figure.

## Kernel or operator

The kernel for a 3x3 window. Larger windows have more cells with the same weight, 1 divided by the number of cells.

--8<-- "kernels/box.md"

## Algorithm

--8<-- "filters/box-steps.md"

## Parameters

--8<-- "filters/box-params.md"

## Implementation

Each pass keeps a running sum over the window. Sliding the window by one pixel adds the entering value and subtracts the leaving value, so the cost per pixel does not depend on the window size. On images with transparency, colors are averaged weighted by alpha. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/box.md"

## Complexity

--8<-- "filters/box-complexity.md"

## Artifacts and limitations

--8<-- "filters/box-limits.md"

## Tests

The test compares the filter with `scipy.ndimage.uniform_filter` for window sizes 3 and 5 and all five border modes. The largest difference allowed is 1e-4 relative to the value. Other tests check that any region gives the same pixels as the whole image, and that alpha stays unchanged.

--8<-- "filters/box-tests.md"

## References

--8<-- "filters/box-references.md"
