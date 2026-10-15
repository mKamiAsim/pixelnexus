# Ripple distortion

--8<-- "filters/ripple-facts.md"

## Overview

The ripple distortion pushes pixels toward and away from the center in rings, like ripples spreading on water. Its rule is PixelNexus's own.

<figure markdown="span">
  ![Two panels: a checkerboard, and the checkerboard with its squares bent into rings around the center.](../../assets/figures/ripple-light.svg#only-light){ width="480" }
  ![Two panels: a checkerboard, and the checkerboard with its squares bent into rings around the center.](../../assets/figures/ripple-dark.svg#only-dark){ width="480" }
  <figcaption>A checkerboard, and the ripple distortion with amplitude 4 and wavelength 24.</figcaption>
</figure>

## How it works

1. Measure each output pixel's distance from the center.
2. Move that distance by a sine of the distance.
3. Read the source at the moved position, at the same angle.

## Mathematical foundation

--8<-- "filters/ripple-formula.md"

The source distance is rho + A sin(2 pi rho / lambda + phase). Where the sine rises, rings are stretched, and where it falls they are pressed. The mapping folds over itself when its slope 1 + (2 pi A / lambda) cos(...) turns negative, which needs an amplitude above lambda / (2 pi).

## Kernel or operator

The Inspector shows the mapping with the current settings, then the bilinear read of the source.

## Algorithm

--8<-- "filters/ripple-steps.md"

## Parameters

--8<-- "filters/ripple-params.md"

## Implementation

`rippleFilter` in `web/src/core/filters/artistic/distort.ts`. It reads the source with `sampleBilinear` through `warpPlane`. The filter is global, and it sets `movesAlpha`, so the runner moves the alpha plane with the same mapping and transparency stays with its colors.

## Worked example

--8<-- "examples/ripple.md"

## Complexity

--8<-- "filters/ripple-complexity.md"

## Artifacts and limitations

--8<-- "filters/ripple-limits.md"

## Tests

The reference computes the same mapping with NumPy and reads the source with scipy.ndimage.map_coordinates at order 1, an independent bilinear sampler, for several settings and border modes. Unit tests check that amplitude 0 changes nothing.

--8<-- "filters/ripple-tests.md"

## References

--8<-- "filters/ripple-references.md"
