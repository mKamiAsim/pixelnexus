# Wave distortion

--8<-- "filters/wave-facts.md"

## Overview

The wave distortion shifts rows sideways, columns up and down, or both, by a sine wave. Straight lines turn into waves, as in a flag or behind rippled glass. Its rule is PixelNexus's own.

<figure markdown="span">
  ![Two panels: a checkerboard, and the checkerboard with its vertical lines turned into waves.](../../assets/figures/wave-light.svg#only-light){ width="480" }
  ![Two panels: a checkerboard, and the checkerboard with its vertical lines turned into waves.](../../assets/figures/wave-dark.svg#only-dark){ width="480" }
  <figcaption>A checkerboard, and the wave distortion with amplitude 6, wavelength 40 and rows moving sideways.</figcaption>
</figure>

## How it works

1. For each output pixel, shift its x by the sine of its row, its y by the sine of its column, or both.
2. Read the source at the shifted position.

## Mathematical foundation

--8<-- "filters/wave-formula.md"

Moving each row by its own amount keeps every row intact but bends the columns. The shift has the shape of the sine wave itself, so a vertical line becomes one full wave every wavelength. With both directions, the two shifts combine into a grid of bumps.

## Kernel or operator

The Inspector shows the mapping with the current settings, then the bilinear read of the source.

## Algorithm

--8<-- "filters/wave-steps.md"

## Parameters

--8<-- "filters/wave-params.md"

## Implementation

`waveFilter` in `web/src/core/filters/artistic/distort.ts`. It reads the source with `sampleBilinear` through `warpPlane`. The filter is global, and it sets `movesAlpha`, so the runner moves the alpha plane with the same mapping and transparency stays with its colors.

## Worked example

--8<-- "examples/wave.md"

## Complexity

--8<-- "filters/wave-complexity.md"

## Artifacts and limitations

--8<-- "filters/wave-limits.md"

## Tests

The reference computes the same mapping with NumPy and reads the source with scipy.ndimage.map_coordinates at order 1, an independent bilinear sampler, for several settings and border modes. Unit tests check that amplitude 0 changes nothing, and that alpha moves with the colors on a transparent image.

--8<-- "filters/wave-tests.md"

## References

--8<-- "filters/wave-references.md"
