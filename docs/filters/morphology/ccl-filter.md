# Connected-component filtering

--8<-- "filters/ccl-filter-facts.md"

## Overview

Connected-component filtering keeps the white objects whose area lies in a chosen range and removes the others. It cleans up specks after a threshold without changing the shape of the objects that stay.

<figure markdown="span">
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the result with the specks removed and every shape kept.](../../assets/figures/ccl-filter-light.svg#only-light){ width="480" }
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the result with the specks removed and every shape kept.](../../assets/figures/ccl-filter-dark.svg#only-dark){ width="480" }
  <figcaption>Connected-component filtering with a smallest area of 10 removes the specks and keeps every shape.</figcaption>
</figure>

## How it works

1. Find the separate objects, with 4 or 8 neighbors.
2. Count the pixels of each object.
3. Keep the objects whose area lies in the range.

## Mathematical foundation

--8<-- "filters/ccl-filter-formula.md"

Labeling gives each connected object its own number. The area of an object is its number of pixels. Keeping objects by area is the simplest attribute filter: it removes whole objects and never changes the ones it keeps.

## Kernel or operator

There is no kernel. The Inspector lists the labeling and the area range.

## Algorithm

--8<-- "filters/ccl-filter-steps.md"

## Parameters

--8<-- "filters/ccl-filter-params.md"

## Implementation

`labelComponents` in `web/src/core/filters/morphology/binary.ts` labels the objects by flood fill, and `cclFilter` keeps those in the area range. It is a global filter, so it always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha. Values at or above 128 count as white, and the result is 255 or 0.

## Worked example

--8<-- "examples/ccl-filter.md"

## Complexity

--8<-- "filters/ccl-filter-complexity.md"

## Artifacts and limitations

--8<-- "filters/ccl-filter-limits.md"

## Tests

The reference uses `scipy.ndimage.label`. The cases cover two area ranges with 4 and 8 neighbors.

--8<-- "filters/ccl-filter-tests.md"

## References

--8<-- "filters/ccl-filter-references.md"
