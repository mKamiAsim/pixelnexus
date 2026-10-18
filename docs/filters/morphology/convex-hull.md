# Convex hull

--8<-- "filters/convex-hull-facts.md"

## Overview

The convex hull replaces every white object with the smallest convex shape that contains it. Dents and holes fill in, and separate objects get separate hulls.

<figure markdown="span">
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the convex hulls, with the L filled to a triangle and the ring filled to a disk.](../../assets/figures/convex-hull-light.svg#only-light){ width="480" }
  ![Two panels: white shapes on black, a bar, an L, a ring, a triangle with a bump and a few specks, and the convex hulls, with the L filled to a triangle and the ring filled to a disk.](../../assets/figures/convex-hull-dark.svg#only-dark){ width="480" }
  <figcaption>The convex hull of each object fills the L shape and the inside of the ring.</figcaption>
</figure>

## How it works

1. Find the separate objects.
2. Compute the convex hull of each object's pixels.
3. Fill every pixel whose center lies inside a hull or on its border.

## Mathematical foundation

--8<-- "filters/convex-hull-formula.md"

A shape is convex when the straight line between any two of its points stays inside it. The hull of an object is the smallest convex shape around it. On a pixel grid, the hull is computed from the midpoints of the pixel edges and then rasterized by pixel centers, as scikit-image does.

## Kernel or operator

There is no kernel. The Inspector lists the components and the hulls.

## Algorithm

--8<-- "filters/convex-hull-steps.md"

## Parameters

--8<-- "filters/convex-hull-params.md"

## Implementation

`convexHullObjects` in `web/src/core/filters/morphology/binary.ts` labels the objects, computes each hull with the monotone chain, and fills it. It is a global filter, so it always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha. Values at or above 128 count as white, and the result is 255 or 0.

## Worked example

--8<-- "examples/convex-hull.md"

## Complexity

--8<-- "filters/convex-hull-complexity.md"

## Artifacts and limitations

--8<-- "filters/convex-hull-limits.md"

## Tests

The reference is `skimage.morphology.convex_hull_object`. The cases cover 4 and 8 neighbors.

--8<-- "filters/convex-hull-tests.md"

## References

--8<-- "filters/convex-hull-references.md"
