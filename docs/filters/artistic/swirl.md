# Swirl distortion

--8<-- "filters/swirl-facts.md"

## Overview

The swirl distortion twists the image around its center, most strongly near the center and less further out, like a whirlpool. It uses the mapping of scikit-image's transform.swirl.

<figure markdown="span">
  ![Two panels: a checkerboard, and the checkerboard twisted into a whirl around its center.](../../assets/figures/swirl-light.svg#only-light){ width="480" }
  ![Two panels: a checkerboard, and the checkerboard twisted into a whirl around its center.](../../assets/figures/swirl-dark.svg#only-dark){ width="480" }
  <figcaption>A checkerboard, and the swirl distortion with strength 4 and radius 60.</figcaption>
</figure>

## How it works

1. Measure each output pixel's distance and angle from the center.
2. Add a turn that decays with the distance.
3. Read the source at the turned position, at the same distance.

## Mathematical foundation

--8<-- "filters/swirl-formula.md"

Only the angle changes, so circles around the center map onto themselves. The turn decays exponentially, so it halves at a fixed step in distance, about 0.096 times the radius. Neighbors at different distances turn by different angles, which bends straight lines into spirals.

## Kernel or operator

The Inspector shows the mapping with the current settings, then the bilinear read of the source.

## Algorithm

--8<-- "filters/swirl-steps.md"

## Parameters

--8<-- "filters/swirl-params.md"

## Implementation

`swirlFilter` in `web/src/core/filters/artistic/distort.ts`. It reads the source with `sampleBilinear` through `warpPlane`. The filter is global, and it sets `movesAlpha`, so the runner moves the alpha plane with the same mapping and transparency stays with its colors.

## Worked example

--8<-- "examples/swirl.md"

## Complexity

--8<-- "filters/swirl-complexity.md"

## Artifacts and limitations

--8<-- "filters/swirl-limits.md"

## Tests

The reference computes the same mapping with NumPy and reads the source with scipy.ndimage.map_coordinates at order 1, an independent bilinear sampler, for several settings and border modes. Before the cases are written, the reference is checked against skimage.transform.swirl with the same center for three border modes.

--8<-- "filters/swirl-tests.md"

## References

--8<-- "filters/swirl-references.md"
