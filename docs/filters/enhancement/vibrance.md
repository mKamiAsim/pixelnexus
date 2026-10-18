# Vibrance

--8<-- "filters/vibrance-facts.md"

## Overview

Vibrance raises the saturation of muted colors more than that of strong colors. Vivid colors, which would clip first, change little. The rule here is PixelNexus's own. Photo editors offer vibrance with the same aim, but do not publish their rules.

<figure markdown="span">
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart at vibrance 100 with stronger pastel colors, and at vibrance -100 with muted pastels.](../../assets/figures/vibrance-light.svg#only-light){ width="480" }
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart at vibrance 100 with stronger pastel colors, and at vibrance -100 with muted pastels.](../../assets/figures/vibrance-dark.svg#only-dark){ width="480" }
  <figcaption>Vibrance at 100 and at -100.</figcaption>
</figure>

## How it works

1. Compute the HSV saturation S of the pixel.
2. Set the factor to 1 + a (1 - S).
3. Move each channel away from the gray by that factor, as in the saturation filter.

## Mathematical foundation

--8<-- "filters/vibrance-formula.md"

The factor falls in a straight line from 1 + a for a gray pixel to 1 for a pure color. So pure colors keep their values, and muted colors change the most. The gray uses the same weights as the saturation filter, so the gray value of each pixel stays until channels clip.

## Kernel or operator

The Inspector shows the three steps: the saturation of the pixel, the factor, and the mix with the gray.

## Algorithm

--8<-- "filters/vibrance-steps.md"

## Parameters

--8<-- "filters/vibrance-params.md"

## Implementation

`vibranceFilter` in `web/src/core/filters/enhancement/color-adjust.ts`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/vibrance.md"

## Complexity

--8<-- "filters/vibrance-complexity.md"

## Artifacts and limitations

--8<-- "filters/vibrance-limits.md"

## Tests

The reference computes the same rule with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels.

--8<-- "filters/vibrance-tests.md"

## References

--8<-- "filters/vibrance-references.md"
