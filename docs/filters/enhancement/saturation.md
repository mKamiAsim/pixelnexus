# Saturation adjustment

--8<-- "filters/saturation-facts.md"

## Overview

Saturation adjustment makes colors stronger or weaker. Each color moves away from or toward its own gray by a factor, while the gray value stays. It uses the matrix of the CSS saturate() function.

<figure markdown="span">
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart at 50 percent saturation with pale colors, and at 200 percent with intense colors.](../../assets/figures/saturation-light.svg#only-light){ width="480" }
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart at 50 percent saturation with pale colors, and at 200 percent with intense colors.](../../assets/figures/saturation-dark.svg#only-dark){ width="480" }
  <figcaption>Saturation at 50 and 200 percent.</figcaption>
</figure>

## How it works

1. Find the gray of the pixel, Y = 0.213 R + 0.715 G + 0.072 B.
2. Measure how far each channel is from Y.
3. Multiply that distance by the factor and add Y back.

## Mathematical foundation

--8<-- "filters/saturation-formula.md"

Written per channel, the matrix is C' = Y + s (C - Y). The gray Y of the output equals the gray of the input, since the weights of Y add up to 1. So saturation changes color strength without changing the gray value, until channels clip.

## Kernel or operator

The Inspector shows the 3 by 3 matrix for the current settings. Each row gives the weights of one output channel.

## Algorithm

--8<-- "filters/saturation-steps.md"

## Parameters

--8<-- "filters/saturation-params.md"

## Implementation

`saturationFilter` in `web/src/core/filters/enhancement/color-adjust.ts` builds its matrix with `saturateMatrix`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/saturation.md"

## Complexity

--8<-- "filters/saturation-complexity.md"

## Artifacts and limitations

--8<-- "filters/saturation-limits.md"

## Tests

The reference computes the matrix of the W3C spec with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels.

--8<-- "filters/saturation-tests.md"

## References

--8<-- "filters/saturation-references.md"
