# Thickening

--8<-- "filters/thickening-facts.md"

## Overview

Thickening grows white shapes by thinning the black background between them. Since thinning never breaks the background apart, the shapes grow toward each other but never merge.

<figure markdown="span">
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the thickened result, with larger shapes separated by thin black lines.](../../assets/figures/thickening-light.svg#only-light){ width="480" }
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the thickened result, with larger shapes separated by thin black lines.](../../assets/figures/thickening-dark.svg#only-dark){ width="480" }
  <figcaption>Thickening with 3 iterations grows the shapes by thinning the background, so they grow but do not merge.</figcaption>
</figure>

## How it works

1. Swap black and white.
2. Thin the new white areas for the chosen number of iterations.
3. Swap back.

## Mathematical foundation

--8<-- "filters/thickening-formula.md"

Thickening is the dual of thinning. Thinning the background removes background pixels next to the shapes, which adds them to the shapes, but never where that would join two shapes.

## Kernel or operator

There is no kernel. The Inspector lists the complement, the thinning and the second complement.

## Algorithm

--8<-- "filters/thickening-steps.md"

## Parameters

--8<-- "filters/thickening-params.md"

## Implementation

`thickeningFilter` in `web/src/core/filters/morphology/binary.ts` thins the complement with `thin`. Pixels outside the image count as black in the original image, so the background is not peeled from the image edge. It is a global filter, so it always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha. Values at or above 128 count as white, and the result is 255 or 0.

## Worked example

--8<-- "examples/thickening.md"

## Complexity

--8<-- "filters/thickening-complexity.md"

## Artifacts and limitations

--8<-- "filters/thickening-limits.md"

## Tests

The reference thins the complement, framed by background, with the same references as thinning. The cases cover both methods.

--8<-- "filters/thickening-tests.md"

## References

--8<-- "filters/thickening-references.md"
