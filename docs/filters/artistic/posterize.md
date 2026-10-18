# Posterize

--8<-- "filters/posterize-facts.md"

## Overview

Posterize keeps only a few levels per channel, so smooth shading turns into flat bands of color. It gives a poster-like look, and it shows what happens when an image has too few intensity levels.

<figure markdown="span">
  ![Three panels: a smooth gray ramp from black to white, the ramp with 4 flat steps, and the ramp with 8 flat steps.](../../assets/figures/posterize-light.svg#only-light){ width="480" }
  ![Three panels: a smooth gray ramp from black to white, the ramp with 4 flat steps, and the ramp with 8 flat steps.](../../assets/figures/posterize-dark.svg#only-dark){ width="480" }
  <figcaption>A gray ramp posterized to 4 and to 8 levels.</figcaption>
</figure>

## How it works

1. Cut the range 0 to 255 into equal bins, one per level.
2. Find the bin of each value.
3. Replace the value with the level of its bin. The levels run evenly from 0 to 255.

## Mathematical foundation

--8<-- "filters/posterize-formula.md"

Posterizing is uniform quantization. With n levels, neighboring values in one bin become equal, and the jump between bins is 255 / (n - 1). In smooth areas these jumps show as false contours, lines that are not in the scene.

## Kernel or operator

The Inspector draws the transfer curve for the current settings, with the input value on the horizontal axis and the output on the vertical axis. The Point-op curve in the Learn panel draws the same curve with the histograms of the open image before and after.

## Algorithm

--8<-- "filters/posterize-steps.md"

## Parameters

--8<-- "filters/posterize-params.md"

## Implementation

`posterizeFilter` in `web/src/core/filters/enhancement/point-ops.ts` uses `posterizeTransfer`. The filter is a point filter: the runner builds a table of 256 outputs once and looks up each pixel. Values between two levels, as luma often is, go through the curve directly.

## Worked example

--8<-- "examples/posterize.md"

## Complexity

--8<-- "filters/posterize-complexity.md"

## Artifacts and limitations

--8<-- "filters/posterize-limits.md"

## Tests

The reference writes the same curve with NumPy and applies it to the random test plane. The cases cover 2, 3, 4, 7 and 64 levels.

--8<-- "filters/posterize-tests.md"

## References

--8<-- "filters/posterize-references.md"
