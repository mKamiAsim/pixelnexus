# Black-and-white conversion

--8<-- "filters/bw-mix-facts.md"

## Overview

Black-and-white conversion turns the image gray with weights for red, green and blue that you choose. It works like a colored filter in front of black-and-white film: a high red weight makes red things light and blue things dark.

<figure markdown="span">
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the gray version with the default weights, and the gray version with a red-filter mix where blues are dark.](../../assets/figures/bw-mix-light.svg#only-light){ width="480" }
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the gray version with the default weights, and the gray version with a red-filter mix where blues are dark.](../../assets/figures/bw-mix-dark.svg#only-dark){ width="480" }
  <figcaption>Black-and-white conversion with the default weights 30, 59, 11 and with the red-filter mix 70, 30, 0.</figcaption>
</figure>

## How it works

1. Multiply red, green and blue by their weights.
2. Add the three and divide by 100.
3. Write the result to all three channels.

## Mathematical foundation

--8<-- "filters/bw-mix-formula.md"

The conversion is a projection of the color onto one direction in RGB space. Colors whose weighted sums match turn into the same gray, so any weights lose some differences between colors. The weights choose which differences survive.

## Kernel or operator

The Inspector shows the three weights as fractions of 1.

## Algorithm

--8<-- "filters/bw-mix-steps.md"

## Parameters

--8<-- "filters/bw-mix-params.md"

## Implementation

`bwMixFilter` in `web/src/core/filters/enhancement/color-adjust.ts`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/bw-mix.md"

## Complexity

--8<-- "filters/bw-mix-complexity.md"

## Artifacts and limitations

--8<-- "filters/bw-mix-limits.md"

## Tests

The reference computes the weighted sum with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels.

--8<-- "filters/bw-mix-tests.md"

## References

--8<-- "filters/bw-mix-references.md"
