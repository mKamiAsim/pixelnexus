# Local variance filter

--8<-- "filters/local-variance-facts.md"

## Overview

The local variance filter maps how much the values in the window around each pixel spread around their mean. Flat areas give 0. Edges, texture and noise give high values. It is the quantity that the adaptive Wiener and Lee filters use to decide how much to smooth.

<figure markdown="span">
  ![Two panels: the Noise patches test image with clean, Gaussian, salt-and-pepper and speckle quadrants, and its 5x5 variance map, black in the clean quadrant and brightest in the salt-and-pepper quadrant.](../../assets/figures/local-variance-light.svg#only-light){ width="480" }
  ![Two panels: the Noise patches test image with clean, Gaussian, salt-and-pepper and speckle quadrants, and its 5x5 variance map, black in the clean quadrant and brightest in the salt-and-pepper quadrant.](../../assets/figures/local-variance-dark.svg#only-dark){ width="480" }
  <figcaption>The variance is 0 in the clean quadrant, and highest where salt and pepper make large jumps.</figcaption>
</figure>

## How it works

1. Take the window around the pixel.
2. Find the mean of its values and the mean of their squares.
3. Write the mean of the squares minus the square of the mean.

## Mathematical foundation

--8<-- "filters/local-variance-formula.md"

The variance is the second central moment. Written as E[w^2] - E[w]^2, it needs only two running sums, so the cost does not depend on the window size. It is the population variance, divided by n and not by n - 1. Its unit is levels squared, so values reach 16256 for a window that is half black and half white. The result is a new quantity, not an image, so it goes through the output mapping. With the brightness scope the map is gray.

## Kernel or operator

There is no kernel. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window values at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/local-variance-steps.md"

## Parameters

--8<-- "filters/local-variance-params.md"

## Implementation

`localMoments` in `web/src/core/filters/adaptive/local-stats.ts` sums the values and their squares with running sums in float64, which avoids the rounding loss of float32 when the two means are subtracted. Small negative results from rounding are set to 0. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/local-variance.md"

## Complexity

--8<-- "filters/local-variance-complexity.md"

## Artifacts and limitations

--8<-- "filters/local-variance-limits.md"

## Tests

The reference takes `numpy.var` of each window. Before it is used, the script checks it against `scipy.ndimage.generic_filter` with `numpy.var`. The test covers window sizes 3 and 5 for all five border modes.

--8<-- "filters/local-variance-tests.md"

## References

--8<-- "filters/local-variance-references.md"
