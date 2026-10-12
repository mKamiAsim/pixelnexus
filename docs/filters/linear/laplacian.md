# Laplacian

--8<-- "filters/laplacian-facts.md"

## Overview

The Laplacian measures how much a pixel differs from the average of its neighbors. It is zero on flat areas and on straight ramps, and large at fine detail and edges. It is a second derivative, so it reacts strongly to noise.

<figure markdown="span">
  ![Two line plots across a soft edge. The top shows the edge. The bottom shows the Laplacian, with a positive lobe on the dark side and a negative lobe on the bright side.](../../assets/figures/laplacian-light.svg#only-light){ width="480" }
  ![Two line plots across a soft edge. The top shows the edge. The bottom shows the Laplacian, with a positive lobe on the dark side and a negative lobe on the bright side.](../../assets/figures/laplacian-dark.svg#only-dark){ width="480" }
  <figcaption>The Laplacian gives a negative and a positive lobe on the two sides of an edge.</figcaption>
</figure>

## How it works

1. Look at the pixel and its 4 or 8 closest neighbors.
2. Add up the neighbors.
3. Subtract the center value, counted as many times as there are neighbors.
4. The result is 0 where the pixel matches its surroundings.

## Mathematical foundation

--8<-- "filters/laplacian-formula.md"

Along one axis, the second difference I(x-1) - 2 I(x) + I(x+1) approximates the second derivative. The 4-neighbor kernel adds the second differences along x and y. The 8-neighbor kernel also adds the diagonal differences, which makes the response stronger and closer to the same in every direction. With the positive-center sign the kernel is multiplied by -1.

## Kernel or operator

The two variants with the negative-center sign. The positive-center variants are the same kernels times -1.

--8<-- "kernels/laplacian.md"

## Algorithm

--8<-- "filters/laplacian-steps.md"

## Parameters

--8<-- "filters/laplacian-params.md"

## Implementation

`laplacianKernel` returns the selected kernel, and the filter correlates the image with it. By default the filter works on luma. The result is signed, so the output mapping decides how it is shown. Offset by 128 shows 0 as middle gray. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/laplacian.md"

## Complexity

--8<-- "filters/laplacian-complexity.md"

## Artifacts and limitations

--8<-- "filters/laplacian-limits.md"

## Tests

Both variants and both signs are compared with `scipy.ndimage.correlate` for three border modes, within 1e-4 relative to the value. The fixture generator first checks that the 4-neighbor kernel matches `scipy.ndimage.laplace`.

--8<-- "filters/laplacian-tests.md"

## References

--8<-- "filters/laplacian-references.md"
