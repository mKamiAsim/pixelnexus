# Midpoint filter

--8<-- "filters/midpoint-facts.md"

## Overview

The midpoint filter replaces each pixel with the value halfway between the smallest and the largest value of its window. It suits noise whose values spread evenly over a range, such as uniform noise. It fails on impulse noise, because one speck decides half of the result.

<figure markdown="span">
  ![Four panels in two rows: disks with Gaussian noise and the smoother result of a 3x3 midpoint filter, then disks with salt-and-pepper noise and a 3x3 midpoint result full of gray squares.](../../assets/figures/midpoint-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with Gaussian noise and the smoother result of a 3x3 midpoint filter, then disks with salt-and-pepper noise and a 3x3 midpoint result full of gray squares.](../../assets/figures/midpoint-dark.svg#only-dark){ width="480" }
  <figcaption>The midpoint smooths Gaussian noise, but each impulse spreads into a gray square.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Find its smallest and largest values.
3. Write the value halfway between them.

## Mathematical foundation

--8<-- "filters/midpoint-formula.md"

The midpoint, also called the mid-range, uses only two order statistics, the first and the last. Take noise that is uniform on an interval around the true value. Then the midpoint of a sample estimates the center better than the sample mean, because the edges of the range carry the most information. For noise with long tails, such as Gaussian or impulse noise, it is worse than the mean.

## Kernel or operator

There is no kernel, because the output is not a weighted sum. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/midpoint-steps.md"

## Parameters

--8<-- "filters/midpoint-params.md"

## Implementation

The filter runs the min and max passes of `extremePlane` in `web/src/core/filters/nonlinear/window.ts` and averages them. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/midpoint.md"

## Complexity

--8<-- "filters/midpoint-complexity.md"

## Artifacts and limitations

--8<-- "filters/midpoint-limits.md"

## Tests

The filter is compared with the mean of `scipy.ndimage.minimum_filter` and `scipy.ndimage.maximum_filter` for window sizes 3 and 5 and all five border modes. The results match within float rounding.

--8<-- "filters/midpoint-tests.md"

## References

--8<-- "filters/midpoint-references.md"
