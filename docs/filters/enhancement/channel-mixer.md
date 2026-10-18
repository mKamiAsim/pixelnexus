# Channel mixer

--8<-- "filters/channel-mixer-facts.md"

## Overview

The channel mixer builds each output channel as a weighted sum of the input red, green and blue. It is the most general linear color change: it can swap channels, blend them, or correct a cast. The default changes nothing.

<figure markdown="span">
  ![Two panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, and the chart with red and blue swapped.](../../assets/figures/channel-mixer-light.svg#only-light){ width="480" }
  ![Two panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, and the chart with red and blue swapped.](../../assets/figures/channel-mixer-dark.svg#only-dark){ width="480" }
  <figcaption>The channel mixer with red and blue swapped.</figcaption>
</figure>

## How it works

1. Build the 3 by 3 matrix from the nine weights in percent.
2. Multiply the color of each pixel by it.
3. Clip the results to 0 to 255.

## Mathematical foundation

--8<-- "filters/channel-mixer-formula.md"

Any linear change of RGB colors is a 3 by 3 matrix. Black-and-white conversion, sepia, saturation and hue rotation are special cases of it. A row that adds up to 100 percent keeps grays at the same level in that channel.

## Kernel or operator

The Inspector shows the 3 by 3 matrix for the current settings. Each row gives the weights of one output channel.

## Algorithm

--8<-- "filters/channel-mixer-steps.md"

## Parameters

--8<-- "filters/channel-mixer-params.md"

## Implementation

`channelMixerFilter` in `web/src/core/filters/enhancement/color-adjust.ts`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/channel-mixer.md"

## Complexity

--8<-- "filters/channel-mixer-complexity.md"

## Artifacts and limitations

--8<-- "filters/channel-mixer-limits.md"

## Tests

The reference computes the matrix product with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels.

--8<-- "filters/channel-mixer-tests.md"

## References

--8<-- "filters/channel-mixer-references.md"
