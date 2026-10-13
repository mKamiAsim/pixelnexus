# Standard deviation filter

--8<-- "filters/local-std-facts.md"

## Overview

The standard deviation filter maps how far the values in the window typically are from their mean, in levels. It is the square root of the local variance, so it has the same unit as the image. In a flat area with noise, it measures the noise level.

<figure markdown="span">
  ![Two panels: bright disks on a dark background, and the 5x5 standard deviation map, black inside the disks and bright rings on their edges.](../../assets/figures/local-std-light.svg#only-light){ width="480" }
  ![Two panels: bright disks on a dark background, and the 5x5 standard deviation map, black inside the disks and bright rings on their edges.](../../assets/figures/local-std-dark.svg#only-dark){ width="480" }
  <figcaption>The standard deviation is near 0 inside the disks and high on their edges.</figcaption>
</figure>

## How it works

1. Take the window around the pixel.
2. Find the variance of its values.
3. Write the square root of the variance.

## Mathematical foundation

--8<-- "filters/local-std-formula.md"

For 8-bit values the standard deviation is at most 127.5, reached when half the window is 0 and half is 255. So the default mapping clips and needs no stretch. In a flat region with additive Gaussian noise of standard deviation sigma, the expected value of the local standard deviation is close to sigma for large windows. The result is a new quantity, not an image, so it goes through the output mapping. With the brightness scope the map is gray.

## Kernel or operator

There is no kernel. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window values at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/local-std-steps.md"

## Parameters

--8<-- "filters/local-std-params.md"

## Implementation

`localStdFilter` in `web/src/core/filters/adaptive/local-stats.ts` takes the square root of the variance from `localMoments`, which uses running sums in float64. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/local-std.md"

## Complexity

--8<-- "filters/local-std-complexity.md"

## Artifacts and limitations

--8<-- "filters/local-std-limits.md"

## Tests

The reference takes the square root of `numpy.var` of each window, checked against `scipy.ndimage.generic_filter`. The test covers window sizes 3 and 5 for all five border modes.

--8<-- "filters/local-std-tests.md"

## References

--8<-- "filters/local-std-references.md"
