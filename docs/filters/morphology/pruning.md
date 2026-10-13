# Pruning

--8<-- "filters/pruning-facts.md"

## Overview

Pruning removes short branches, or spurs, from thin lines such as the result of thinning. It shortens every line end, which removes the spurs, and then lets the ends of the main lines grow back to their full length.

<figure markdown="span">
  ![Two panels: thinned shapes with a few short branches, and the pruned result, in which the short branches are gone and the main lines remain.](../../assets/figures/pruning-light.svg#only-light){ width="480" }
  ![Two panels: thinned shapes with a few short branches, and the pruned result, in which the short branches are gone and the main lines remain.](../../assets/figures/pruning-dark.svg#only-dark){ width="480" }
  <figcaption>Pruning with length 3 removes the short branches that thinning left, and keeps the main lines.</figcaption>
</figure>

## How it works

1. Remove the end points of every line, all at once, n times.
2. Find the end points that are left.
3. Grow them back n times with the 3 x 3 square, but only along the original lines.
4. Join the shortened lines and the regrown ends.

## Mathematical foundation

--8<-- "filters/pruning-formula.md"

The four steps follow Gonzalez and Woods. The end point rule is this filter's own. A pixel is an end point when its neighbors are one corner pixel alone, or one side pixel with none, one or both of the corners next to it. A spur next to the end of a main line can grow back with that end.

## Kernel or operator

There is no kernel. The Inspector lists the four steps with the chosen length.

## Algorithm

--8<-- "filters/pruning-steps.md"

## Parameters

--8<-- "filters/pruning-params.md"

## Implementation

`prune` in `web/src/core/filters/morphology/binary.ts` runs the four steps. Pixels outside the image count as black. It is a global filter, so it always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha. Values at or above 128 count as white, and the result is 255 or 0.

## Worked example

--8<-- "examples/pruning.md"

## Complexity

--8<-- "filters/pruning-complexity.md"

## Artifacts and limitations

--8<-- "filters/pruning-limits.md"

## Tests

The reference runs the same steps with NumPy. Before the cases are written, the script checks that a line with a short spur loses the spur and keeps its full length. The cases cover two lengths on a thinned image.

--8<-- "filters/pruning-tests.md"

## References

--8<-- "filters/pruning-references.md"
