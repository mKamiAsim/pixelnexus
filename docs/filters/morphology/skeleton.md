# Skeletonization

--8<-- "filters/skeleton-facts.md"

## Overview

The morphological skeleton keeps the center points of a shape. These are the centers of the largest copies of the structuring element that fit inside the shape. Unlike thinning it can be broken into pieces, but the shape can be rebuilt from it exactly.

<figure markdown="span">
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the morphological skeleton, with center lines and corner points that are partly broken.](../../assets/figures/skeleton-light.svg#only-light){ width="480" }
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the morphological skeleton, with center lines and corner points that are partly broken.](../../assets/figures/skeleton-dark.svg#only-dark){ width="480" }
  <figcaption>The morphological skeleton with the 3 x 3 cross. It follows the center of each shape but is often broken.</figcaption>
</figure>

## How it works

1. Erode the shape again and again with the element.
2. Each time, keep the pixels that an opening of the eroded shape would remove.
3. Join everything kept.

## Mathematical foundation

--8<-- "filters/skeleton-formula.md"

Lantuejoul's formula builds the skeleton from erosions and openings. After k erosions, the pixels that an opening removes are the centers of the largest copies of the element, of size k, that fit at that place. The union over all k is the skeleton.

## Kernel or operator

There is no kernel. The Inspector lists the formula with the chosen element.

## Algorithm

--8<-- "filters/skeleton-steps.md"

## Parameters

--8<-- "filters/skeleton-params.md"

## Implementation

`morphologicalSkeleton` in `web/src/core/filters/morphology/binary.ts` erodes and opens until the erosion is empty. Pixels outside the image count as black. It is a global filter, so it always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha. Values at or above 128 count as white, and the result is 255 or 0.

## Worked example

--8<-- "examples/skeleton.md"

## Complexity

--8<-- "filters/skeleton-complexity.md"

## Artifacts and limitations

--8<-- "filters/skeleton-limits.md"

## Tests

The reference uses `scipy.ndimage.binary_erosion` and `binary_dilation` with the same element. The cases cover three elements, one of them not symmetric.

--8<-- "filters/skeleton-tests.md"

## References

--8<-- "filters/skeleton-references.md"
