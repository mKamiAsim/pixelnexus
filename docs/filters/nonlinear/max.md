# Max filter

--8<-- "filters/max-facts.md"

## Overview

The max filter replaces each pixel with the largest value of its window. Black specks disappear, because a window almost always holds a brighter value. Bright areas grow by the window radius, and dark areas shrink by the same amount.

<figure markdown="span">
  ![Three panels: disks on a dark background with black specks, the result of a 3x3 max filter with no specks and slightly larger disks, and a 3x3 median with no specks.](../../assets/figures/max-light.svg#only-light){ width="480" }
  ![Three panels: disks on a dark background with black specks, the result of a 3x3 max filter with no specks and slightly larger disks, and a 3x3 median with no specks.](../../assets/figures/max-dark.svg#only-dark){ width="480" }
  <figcaption>The max filter removes black specks and grows the bright disks.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Find its largest value.
3. Write that value as the new pixel.

## Mathematical foundation

--8<-- "filters/max-formula.md"

The maximum is the last order statistic. It is also gray dilation with a flat square structuring element. Like the min filter, it is separable: the max over the columns of the max over the rows. A min filter followed by a max filter of the same size is a morphological opening, which removes bright details smaller than the window.

## Kernel or operator

The Inspector shows the window, the number of values and the rank that is used. The Rank stepper in the Learn panel shows the sorted window at any pixel and the value the filter gives there. For the max filter the rank is the number of values, the last one.

## Algorithm

--8<-- "filters/max-steps.md"

## Parameters

--8<-- "filters/max-params.md"

## Implementation

`extremePlane` in `web/src/core/filters/nonlinear/window.ts` runs a row pass and a column pass. The morphology filters of Phase 5d share this code. Values keep their fractions. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/max.md"

## Complexity

--8<-- "filters/max-complexity.md"

## Artifacts and limitations

--8<-- "filters/max-limits.md"

## Tests

The filter is compared with `scipy.ndimage.maximum_filter` for window sizes 3 and 5 and all five border modes. A unit test checks that the sliding-histogram rank code gives the same result with the last rank.

--8<-- "filters/max-tests.md"

## References

--8<-- "filters/max-references.md"
