# Geometric mean filter

--8<-- "filters/geometric-mean-facts.md"

## Overview

The geometric mean filter replaces each pixel with the n-th root of the product of its n window values. It smooths about as much as the box filter, and loses a little less detail. A single 0 in the window makes the product 0, so black specks grow into black squares.

<figure markdown="span">
  ![Four panels in two rows: disks with Gaussian noise and the smoother geometric mean result, then disks with black specks and a geometric mean result with black squares.](../../assets/figures/geometric-mean-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with Gaussian noise and the smoother geometric mean result, then disks with black specks and a geometric mean result with black squares.](../../assets/figures/geometric-mean-dark.svg#only-dark){ width="480" }
  <figcaption>The geometric mean smooths Gaussian noise like the box filter. Each black speck blacks out its window.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Multiply its values together.
3. Write the n-th root of the product.

## Mathematical foundation

--8<-- "filters/geometric-mean-formula.md"

The geometric mean is the exponential of the mean of the logarithms. By the inequality of arithmetic and geometric means, it is never larger than the arithmetic mean, and equal only when all values are the same. So the filter darkens slightly where the window varies. The logarithm of 0 is minus infinity, so a window that holds a 0 gives 0. That is also the limit of the product.

## Kernel or operator

There is no kernel, because the output is not a weighted sum. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/geometric-mean-steps.md"

## Parameters

--8<-- "filters/geometric-mean-params.md"

## Implementation

`geometricMeanFilter` in `web/src/core/filters/nonlinear/means.ts` sums the logarithms of the values above 0 and counts the zeros with running sums in float64, so the cost does not grow with the window. In the constant border mode, the positions outside the image count as zeros. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/geometric-mean.md"

## Complexity

--8<-- "filters/geometric-mean-complexity.md"

## Artifacts and limitations

--8<-- "filters/geometric-mean-limits.md"

## Tests

The reference takes the exponential of the mean logarithm of each NumPy window. Before it is used, it is checked against `scipy.stats.gmean` on windows without zeros. The test input has three zeros, so the zero rule is tested too, for window sizes 3 and 5 and three border modes.

--8<-- "filters/geometric-mean-tests.md"

## References

--8<-- "filters/geometric-mean-references.md"
