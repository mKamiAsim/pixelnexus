# White-patch correction

--8<-- "filters/white-patch-facts.md"

## Overview

White-patch correction balances colors by assuming that the brightest part of each channel is white. It scales each channel so that this value reaches white. With percentile 100 it is the max-RGB method. A lower percentile ignores the very brightest pixels, such as small reflections and noise.

<figure markdown="span">
  ![Three panels: the color chart with a strong orange cast, the chart after white-patch correction at percentile 100, and at percentile 99, both with less cast and pinkish highlights.](../../assets/figures/white-patch-light.svg#only-light){ width="480" }
  ![Three panels: the color chart with a strong orange cast, the chart after white-patch correction at percentile 100, and at percentile 99, both with less cast and pinkish highlights.](../../assets/figures/white-patch-dark.svg#only-dark){ width="480" }
  <figcaption>The chart with a tungsten cast, made by adapting it from D65 to illuminant A, after white-patch correction at percentiles 100 and 99.</figcaption>
</figure>

## How it works

1. Find the chosen percentile of each channel over the whole image.
2. Take its inverse as the gain of that channel.
3. Multiply every pixel by the gains, so the bright values reach white.

## Mathematical foundation

--8<-- "filters/white-patch-formula.md"

The retinex work of Land and McCann assumes that the brightest surface in view is white, so its color is the color of the light. Dividing by it removes the light. The method breaks when a channel is already clipped at 255, since the true value there is lost. In the figure, the cast pushed red past 255, where it clipped, so the highlights stay pinkish after the correction.

## Kernel or operator

The gains depend on the image, so the Inspector shows how they are computed and how they scale the channels.

## Algorithm

--8<-- "filters/white-patch-steps.md"

## Parameters

--8<-- "filters/white-patch-params.md"

## Implementation

`whitePatchFilter` in `web/src/core/filters/enhancement/white-balance.ts` finds the percentiles with `whitePatchGains`, using the histogram percentile of the point operations. It is a global color filter, so it always sees the whole image.

## Worked example

--8<-- "examples/white-patch.md"

## Complexity

--8<-- "filters/white-patch-complexity.md"

## Artifacts and limitations

--8<-- "filters/white-patch-limits.md"

## Tests

The reference computes the same steps with NumPy on a small RGB test image with saturated, gray, black and white pixels, and compares all three channels. The cases cover percentiles 90, 99 and 100, and both settings of Linear light.

--8<-- "filters/white-patch-tests.md"

## References

--8<-- "filters/white-patch-references.md"
