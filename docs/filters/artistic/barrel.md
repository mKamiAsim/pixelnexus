# Barrel distortion

--8<-- "filters/barrel-facts.md"

## Overview

Barrel distortion bows straight lines outward, like the sides of a barrel. Many wide-angle lenses show it. The filter uses the first term of the radial distortion model of camera calibration.

<figure markdown="span">
  ![Two panels: a checkerboard, and the checkerboard with its middle enlarged and its lines bowing outward.](../../assets/figures/barrel-light.svg#only-light){ width="480" }
  ![Two panels: a checkerboard, and the checkerboard with its middle enlarged and its lines bowing outward.](../../assets/figures/barrel-dark.svg#only-dark){ width="480" }
  <figcaption>A checkerboard, and the barrel distortion with strength 0.5.</figcaption>
</figure>

## How it works

1. Measure each output pixel's distance from the center.
2. Read the source from r (1 + k r^2), scaled so the corners stay.
3. Interpolate the source bilinearly.

## Mathematical foundation

--8<-- "filters/barrel-formula.md"

Camera calibration describes radial lens distortion by a polynomial in the distance from the center, 1 + k1 r^2 + k2 r^4 and so on. A positive k1 with this filter's direction of mapping makes the outer part read from further out, so the image is pressed toward the center there and lines bow outward. One term is enough to show the effect.

## Kernel or operator

The Inspector shows the mapping with the current settings, then the bilinear read of the source.

## Algorithm

--8<-- "filters/barrel-steps.md"

## Parameters

--8<-- "filters/barrel-params.md"

## Implementation

`barrelFilter` in `web/src/core/filters/artistic/distort.ts`. It reads the source with `sampleBilinear` through `warpPlane`. The filter is global, and it sets `movesAlpha`, so the runner moves the alpha plane with the same mapping and transparency stays with its colors.

## Worked example

--8<-- "examples/barrel.md"

## Complexity

--8<-- "filters/barrel-complexity.md"

## Artifacts and limitations

--8<-- "filters/barrel-limits.md"

## Tests

The reference computes the same mapping with NumPy and reads the source with scipy.ndimage.map_coordinates at order 1, an independent bilinear sampler, for several settings and border modes. Unit tests check that strength 0 changes nothing and that the corners stay with Keep corners on.

--8<-- "filters/barrel-tests.md"

## References

--8<-- "filters/barrel-references.md"
