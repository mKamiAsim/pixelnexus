# Dithering

--8<-- "filters/dithering-facts.md"

## Overview

Dithering shows many tones with only a few levels, such as black and white. Each pixel is rounded to an allowed level, and the rounding error is hidden in a pattern of dots. From a distance, the eye averages the dots back into the tones of the original.

<figure markdown="span">
  ![Four panels: a gray ramp from black to white, and the ramp in black and white dots with Floyd-Steinberg, with Atkinson, which has cleaner black and white ends, and with the Bayer matrix, which shows a regular cross-hatch.](../../assets/figures/dithering-light.svg#only-light){ width="640" }
  ![Four panels: a gray ramp from black to white, and the ramp in black and white dots with Floyd-Steinberg, with Atkinson, which has cleaner black and white ends, and with the Bayer matrix, which shows a regular cross-hatch.](../../assets/figures/dithering-dark.svg#only-dark){ width="640" }
  <figcaption>A gray ramp dithered to black and white with Floyd-Steinberg, Atkinson and the 8 x 8 Bayer matrix.</figcaption>
</figure>

## How it works

1. Visit the pixels row by row and round each one to the nearest level.
2. Pass its rounding error on to the next pixels, so they make up for it.
3. For the Bayer method, shift each pixel by a fixed threshold pattern before rounding instead.

## Mathematical foundation

--8<-- "filters/dithering-formula.md"

Error diffusion keeps the local mean: the error of each pixel is spread over its neighbors, so a patch of dots has about the mean value of the patch before. Floyd and Steinberg chose their weights so that a gray of 0.5 turns into a checkerboard. The Bayer matrix orders the thresholds so that the dots of each gray level spread out as evenly as possible.

## Kernel or operator

The Inspector shows the rounding step and how the error is spread, or the ordered threshold.

## Algorithm

--8<-- "filters/dithering-steps.md"

## Parameters

--8<-- "filters/dithering-params.md"

## Implementation

`ditheringFilter` in `web/src/core/filters/artistic/dither.ts` calls `ditherPlane`. The Bayer matrices come from `bayerMatrix`, which builds each size from the one half as large.

## Worked example

--8<-- "examples/dithering.md"

## Complexity

--8<-- "filters/dithering-complexity.md"

## Artifacts and limitations

--8<-- "filters/dithering-limits.md"

## Tests

The fixture cases compare every pixel with a NumPy version of the same scans and matrices, for 2, 3 and 4 levels. Before the cases are written, the 4 x 4 Bayer matrix is checked against its printed form. Unit tests check the matrices, that Floyd-Steinberg keeps the mean of a flat gray, and that the Bayer matrix turns mid gray into half black and half white.

--8<-- "filters/dithering-tests.md"

## References

--8<-- "filters/dithering-references.md"
