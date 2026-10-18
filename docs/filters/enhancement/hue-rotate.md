# Hue rotation

--8<-- "filters/hue-rotate-facts.md"

## Overview

Hue rotation turns all colors around the color wheel by one angle. It uses the matrix of the CSS hue-rotate() function, which turns the color difference around the gray axis. Grays stay gray, and the gray value of each color changes little.

<figure markdown="span">
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart turned by 90 degrees, and turned by 180 degrees with colors near their opposites.](../../assets/figures/hue-rotate-light.svg#only-light){ width="480" }
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart turned by 90 degrees, and turned by 180 degrees with colors near their opposites.](../../assets/figures/hue-rotate-dark.svg#only-dark){ width="480" }
  <figcaption>Hue rotation by 90 and by 180 degrees.</figcaption>
</figure>

## How it works

1. Build the matrix for the angle.
2. Multiply the color of each pixel by it.
3. Clip the results to 0 to 255.

## Mathematical foundation

--8<-- "filters/hue-rotate-formula.md"

The matrix has three parts. The first keeps the gray Y = 0.213 R + 0.715 G + 0.072 B. The other two turn the remaining color difference by cos and sin of the angle. Every column of the two turning parts adds up to 0 when weighted by the gray weights, so the gray value stays, up to the rounding of the constants.

## Kernel or operator

The Inspector shows the 3 by 3 matrix for the current settings. Each row gives the weights of one output channel.

## Algorithm

--8<-- "filters/hue-rotate-steps.md"

## Parameters

--8<-- "filters/hue-rotate-params.md"

## Implementation

`hueRotateFilter` in `web/src/core/filters/enhancement/color-adjust.ts` builds its matrix with `hueRotateMatrix`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/hue-rotate.md"

## Complexity

--8<-- "filters/hue-rotate-complexity.md"

## Artifacts and limitations

--8<-- "filters/hue-rotate-limits.md"

## Tests

The reference computes the matrix of the W3C spec with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels.

--8<-- "filters/hue-rotate-tests.md"

## References

--8<-- "filters/hue-rotate-references.md"
