# Sepia

--8<-- "filters/sepia-facts.md"

## Overview

Sepia gives the image the warm brown tone of old photographs. It mixes the colors with the fixed matrix of the CSS sepia() function. The amount blends between the image and the full sepia result.

<figure markdown="span">
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart at sepia amount 50 with faded warm colors, and at amount 100 in browns and creams.](../../assets/figures/sepia-light.svg#only-light){ width="480" }
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart at sepia amount 50 with faded warm colors, and at amount 100 in browns and creams.](../../assets/figures/sepia-dark.svg#only-dark){ width="480" }
  <figcaption>Sepia at amounts 50 and 100.</figcaption>
</figure>

## How it works

1. Build the matrix for the amount.
2. Multiply the color of each pixel by it.
3. Clip the results to 0 to 255.

## Mathematical foundation

--8<-- "filters/sepia-formula.md"

Each output channel is a weighted sum of the inputs. The full sepia matrix maps gray (v, v, v) to about (1.35 v, 1.20 v, 0.94 v), a warm brown. Interpolating between the identity and that matrix gives a partial tone.

## Kernel or operator

The Inspector shows the 3 by 3 matrix for the current settings. Each row gives the weights of one output channel.

## Algorithm

--8<-- "filters/sepia-steps.md"

## Parameters

--8<-- "filters/sepia-params.md"

## Implementation

`sepiaFilter` in `web/src/core/filters/enhancement/color-adjust.ts` builds its matrix with `sepiaMatrix`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/sepia.md"

## Complexity

--8<-- "filters/sepia-complexity.md"

## Artifacts and limitations

--8<-- "filters/sepia-limits.md"

## Tests

The reference computes the matrix of the W3C spec with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels.

--8<-- "filters/sepia-tests.md"

## References

--8<-- "filters/sepia-references.md"
