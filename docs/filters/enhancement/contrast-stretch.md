# Contrast stretching

--8<-- "filters/contrast-stretch-facts.md"

## Overview

Contrast stretching remaps brightness with a curve made of three straight segments. Two control points set where the segments meet. A steep middle segment spreads the values it covers, which raises their contrast. Placing both points at the same input turns the curve into a threshold.

<figure markdown="span">
  ![A plot of output value against input value. One curve has three straight segments with a steep middle part. The other jumps from 0 to 255 at input 128.](../../assets/figures/contrast-stretch-light.svg#only-light){ width="480" }
  ![A plot of output value against input value. One curve has three straight segments with a steep middle part. The other jumps from 0 to 255 at input 128.](../../assets/figures/contrast-stretch-dark.svg#only-dark){ width="480" }
  <figcaption>Contrast stretching with the default control points, and as a threshold at 128.</figcaption>
</figure>

## How it works

1. Sort the two control points by their input values.
2. Join (0, 0), the two points and (255, 255) with straight lines.
3. Look up each pixel value on this curve.

## Mathematical foundation

--8<-- "filters/contrast-stretch-formula.md"

Each segment multiplies the differences between the values it covers by its slope. A slope above 1 stretches them and raises contrast, a slope below 1 presses them together. The slopes of the three segments must balance, since the curve always starts at 0 and ends at 255.

## Kernel or operator

The Inspector draws the transfer curve for the current settings, with the input value on the horizontal axis and the output on the vertical axis. The Point-op curve in the Learn panel draws the same curve with the histograms of the open image before and after.

## Algorithm

--8<-- "filters/contrast-stretch-steps.md"

## Parameters

--8<-- "filters/contrast-stretch-params.md"

## Implementation

`contrastStretchFilter` in `web/src/core/filters/enhancement/point-ops.ts` uses `stretchTransfer`. The filter is a point filter: the runner builds a table of 256 outputs once and looks up each pixel. Values between two levels, as luma often is, go through the curve directly.

## Worked example

--8<-- "examples/contrast-stretch.md"

## Complexity

--8<-- "filters/contrast-stretch-complexity.md"

## Artifacts and limitations

--8<-- "filters/contrast-stretch-limits.md"

## Tests

The reference writes the same curve with NumPy and applies it to the random test plane. The cases include swapped control points, a threshold, and control points at 0 and 255.

--8<-- "filters/contrast-stretch-tests.md"

## References

--8<-- "filters/contrast-stretch-references.md"
