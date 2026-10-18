# Min filter

--8<-- "filters/min-facts.md"

## Overview

The min filter replaces each pixel with the smallest value of its window. White specks disappear, because a window almost always holds a darker value. Dark areas grow by the window radius, and bright areas shrink by the same amount.

<figure markdown="span">
  ![Three panels: disks on a dark background with white specks, the result of a 3x3 min filter with no specks and slightly smaller disks, and a 3x3 median with no specks.](../../assets/figures/min-light.svg#only-light){ width="480" }
  ![Three panels: disks on a dark background with white specks, the result of a 3x3 min filter with no specks and slightly smaller disks, and a 3x3 median with no specks.](../../assets/figures/min-dark.svg#only-dark){ width="480" }
  <figcaption>The min filter removes white specks. The median also removes them but keeps small bright dots.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Find its smallest value.
3. Write that value as the new pixel.

## Mathematical foundation

--8<-- "filters/min-formula.md"

The minimum is the first order statistic. It is also gray erosion with a flat square structuring element. The min over a square equals the min over the columns of the min over the rows, so the filter runs as two passes of k values each. The min filter never makes a new value. It only copies values that are in the window.

## Kernel or operator

The Inspector shows the window, the number of values and the rank that is used. The Rank stepper in the Learn panel shows the sorted window at any pixel and the value the filter gives there. For the min filter the rank is 1.

## Algorithm

--8<-- "filters/min-steps.md"

## Parameters

--8<-- "filters/min-params.md"

## Implementation

`extremePlane` in `web/src/core/filters/nonlinear/window.ts` runs a row pass and a column pass. The morphology filters of Phase 5d share this code for flat rectangles. Values keep their fractions, so a brightness plane is not rounded. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/min.md"

## Complexity

--8<-- "filters/min-complexity.md"

## Artifacts and limitations

--8<-- "filters/min-limits.md"

## Tests

The filter is compared with `scipy.ndimage.minimum_filter` for window sizes 3 and 5 and all five border modes. A unit test checks that the sliding-histogram rank code gives the same result with rank 1.

--8<-- "filters/min-tests.md"

## References

--8<-- "filters/min-references.md"
