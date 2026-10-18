# Hit-or-miss transform

--8<-- "filters/hit-or-miss-facts.md"

## Overview

The hit-or-miss transform marks the pixels where a small pattern matches exactly. The pattern says, for each cell, whether the pixel must be white, must be black, or may be either. It finds isolated points, line ends, corners and other exact local shapes.

<figure markdown="span">
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the hit-or-miss result, which marks only the isolated specks.](../../assets/figures/hit-or-miss-light.svg#only-light){ width="480" }
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the hit-or-miss result, which marks only the isolated specks.](../../assets/figures/hit-or-miss-dark.svg#only-dark){ width="480" }
  <figcaption>The hit-or-miss transform with the default pattern marks only the isolated white specks.</figcaption>
</figure>

## How it works

1. Write the pattern with 1 for white, -1 for black and 0 for either.
2. Place it on each pixel.
3. Mark the pixel if every 1 lies on white and every -1 on black.

## Mathematical foundation

--8<-- "filters/hit-or-miss-formula.md"

The pattern holds two disjoint elements: B_1, the cells that must be white, and B_2, the cells that must be black. The transform is the erosion of the white set by B_1 intersected with the erosion of the black set by B_2. A pixel is marked only when both fit.

## Kernel or operator

The Inspector shows B_1 as a grid and gives the size of B_2.

## Algorithm

--8<-- "filters/hit-or-miss-steps.md"

## Parameters

--8<-- "filters/hit-or-miss-params.md"

## Implementation

`hitOrMissFilter` in `web/src/core/filters/morphology/binary.ts` compares the pattern with the binary image at each pixel. It extends the image once by half the pattern size with the border mode, so strips and whole images agree. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha. Values at or above 128 count as white, and the result is 255 or 0.

## Worked example

--8<-- "examples/hit-or-miss.md"

## Complexity

--8<-- "filters/hit-or-miss-complexity.md"

## Artifacts and limitations

--8<-- "filters/hit-or-miss-limits.md"

## Tests

The reference runs `scipy.ndimage.binary_hit_or_miss` on the extended binary plane. The cases cover two patterns and all five border modes.

--8<-- "filters/hit-or-miss-tests.md"

## References

--8<-- "filters/hit-or-miss-references.md"
