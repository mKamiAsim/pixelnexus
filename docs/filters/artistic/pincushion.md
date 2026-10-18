# Pincushion distortion

--8<-- "filters/pincushion-facts.md"

## Overview

Pincushion distortion bows straight lines inward, toward the center, like the sides of a pincushion. Telephoto lenses often show it. It is the barrel mapping with a negative coefficient.

<figure markdown="span">
  ![Two panels: a checkerboard, and the checkerboard with its edges stretched and its lines bowing inward.](../../assets/figures/pincushion-light.svg#only-light){ width="480" }
  ![Two panels: a checkerboard, and the checkerboard with its edges stretched and its lines bowing inward.](../../assets/figures/pincushion-dark.svg#only-dark){ width="480" }
  <figcaption>A checkerboard, and the pincushion distortion with strength 0.3.</figcaption>
</figure>

## How it works

1. Measure each output pixel's distance from the center.
2. Read the source from r (1 - k r^2), scaled so the corners stay.
3. Interpolate the source bilinearly.

## Mathematical foundation

--8<-- "filters/pincushion-formula.md"

With a negative coefficient, the source distance grows more slowly than r toward the edges, so the outer part is stretched. The mapping must stay one to one: its slope 1 - 3 k r^2 must stay positive up to the corners, which needs k below one third. The strength therefore stops at 0.3.

## Kernel or operator

The Inspector shows the mapping with the current settings, then the bilinear read of the source.

## Algorithm

--8<-- "filters/pincushion-steps.md"

## Parameters

--8<-- "filters/pincushion-params.md"

## Implementation

`pincushionFilter` in `web/src/core/filters/artistic/distort.ts`. It reads the source with `sampleBilinear` through `warpPlane`. The filter is global, and it sets `movesAlpha`, so the runner moves the alpha plane with the same mapping and transparency stays with its colors.

## Worked example

--8<-- "examples/pincushion.md"

## Complexity

--8<-- "filters/pincushion-complexity.md"

## Artifacts and limitations

--8<-- "filters/pincushion-limits.md"

## Tests

The reference computes the same mapping with NumPy and reads the source with scipy.ndimage.map_coordinates at order 1, an independent bilinear sampler, for several settings and border modes. Unit tests check that strength 0 changes nothing and that the corners stay with Keep corners on.

--8<-- "filters/pincushion-tests.md"

## References

--8<-- "filters/pincushion-references.md"
