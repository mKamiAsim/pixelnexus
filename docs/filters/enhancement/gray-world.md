# Gray-world correction

--8<-- "filters/gray-world-facts.md"

## Overview

Gray-world correction balances colors with no input. It assumes that the scene averages to gray, so it scales the channels until their means are equal. It works well on scenes with many colors and fails on scenes dominated by one color.

<figure markdown="span">
  ![Two panels: the color chart with a strong orange cast, and the chart after gray-world correction with the cast mostly removed.](../../assets/figures/gray-world-light.svg#only-light){ width="480" }
  ![Two panels: the color chart with a strong orange cast, and the chart after gray-world correction with the cast mostly removed.](../../assets/figures/gray-world-dark.svg#only-dark){ width="480" }
  <figcaption>The chart with a tungsten cast, made by adapting it from D65 to illuminant A, and after gray-world correction.</figcaption>
</figure>

## How it works

1. Compute the mean of each channel over the whole image.
2. Compute the mean of the three means, the gray they should share.
3. Scale each channel by that gray over its own mean.

## Mathematical foundation

--8<-- "filters/gray-world-formula.md"

Buchsbaum proposed that the average of the surfaces in a scene is gray. Under that assumption, the average color of the image is the color of the light, and dividing by it removes the light. The assumption is about the scene, so a green forest breaks it: the filter takes the green for a cast.

## Kernel or operator

The gains depend on the image, so the Inspector shows how they are computed and how they scale the channels.

## Algorithm

--8<-- "filters/gray-world-steps.md"

## Parameters

--8<-- "filters/gray-world-params.md"

## Implementation

`grayWorldFilter` in `web/src/core/filters/enhancement/white-balance.ts` measures the means with `grayWorldGains`. It is a global color filter, so it always sees the whole image.

## Worked example

--8<-- "examples/gray-world.md"

## Complexity

--8<-- "filters/gray-world-complexity.md"

## Artifacts and limitations

--8<-- "filters/gray-world-limits.md"

## Tests

The reference computes the same steps with NumPy on a small RGB test image with saturated, gray, black and white pixels, and compares all three channels. The cases cover both settings of Linear light.

--8<-- "filters/gray-world-tests.md"

## References

--8<-- "filters/gray-world-references.md"
