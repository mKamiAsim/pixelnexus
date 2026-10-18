# Thinning

--8<-- "filters/thinning-facts.md"

## Overview

Thinning peels white shapes layer by layer until only lines one pixel thick remain. It never breaks a shape into pieces or joins two shapes, and it keeps line ends. Two classic algorithms are offered: Zhang-Suen and Guo-Hall.

<figure markdown="span">
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the thinned result, with every shape reduced to thin lines and the ring still a closed loop.](../../assets/figures/thinning-light.svg#only-light){ width="480" }
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the thinned result, with every shape reduced to thin lines and the ring still a closed loop.](../../assets/figures/thinning-dark.svg#only-dark){ width="480" }
  <figcaption>Zhang-Suen thinning reduces every shape to lines one pixel thick. The ring stays a closed loop.</figcaption>
</figure>

## How it works

1. Look at every white pixel on the outline of a shape.
2. Remove it if that keeps the shape in one piece and does not shorten a line.
3. Do this in two sub-iterations that favor opposite sides, and repeat until nothing changes.

## Mathematical foundation

--8<-- "filters/thinning-formula.md"

Both algorithms decide from the 8 neighbors of a pixel whether it may go. Removing all such pixels at once could erase a line two pixels thick, so each iteration has two sub-iterations with slightly different rules. Zhang and Suen count the neighbors and the black-to-white changes around the pixel. Guo and Hall use a connectivity count and two neighbor counts. The zhang method of `skimage.morphology.skeletonize` uses a modified table, so it gives other results than the rules of the paper used here.

## Kernel or operator

There is no kernel. The Inspector lists the thinning step with the chosen algorithm.

## Algorithm

--8<-- "filters/thinning-steps.md"

## Parameters

--8<-- "filters/thinning-params.md"

## Implementation

`thin` in `web/src/core/filters/morphology/binary.ts` builds a table of 256 neighbor codes for each sub-iteration and removes all marked pixels at once. Pixels outside the image count as black. It is a global filter, so it always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha. Values at or above 128 count as white, and the result is 255 or 0.

## Worked example

--8<-- "examples/thinning.md"

## Complexity

--8<-- "filters/thinning-complexity.md"

## Artifacts and limitations

--8<-- "filters/thinning-limits.md"

## Tests

For Guo-Hall the reference is `skimage.morphology.thin`. For Zhang-Suen it is a NumPy version of the rules of the paper. Before the cases are written, the script checks that a thick bar thins to a line one pixel thick, and that both algorithms keep the number of shapes. The cases cover both methods, with and without an iteration limit.

--8<-- "filters/thinning-tests.md"

## References

--8<-- "filters/thinning-references.md"
