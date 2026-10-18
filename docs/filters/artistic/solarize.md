# Solarize

--8<-- "filters/solarize-facts.md"

## Overview

Solarize keeps the values below a threshold and inverts the values at or above it. The bright parts turn into a negative while the dark parts stay, which imitates a partly reversed photographic print.

<figure markdown="span">
  ![A plot of output value against input value. Each curve follows the straight line of no change up to its threshold, then falls to 0 at 255.](../../assets/figures/solarize-light.svg#only-light){ width="480" }
  ![A plot of output value against input value. Each curve follows the straight line of no change up to its threshold, then falls to 0 at 255.](../../assets/figures/solarize-dark.svg#only-dark){ width="480" }
  <figcaption>Solarize curves with thresholds 128 and 64.</figcaption>
</figure>

## How it works

1. Compare each value with the threshold.
2. Keep the values below it.
3. Replace the values at or above it with 255 minus the value.

## Mathematical foundation

--8<-- "filters/solarize-formula.md"

The curve is the identity below the threshold and the negative above it. It is not monotonic: brighter input can give darker output. So the order of tones flips in the bright part of the image.

## Kernel or operator

The Inspector draws the transfer curve for the current settings, with the input value on the horizontal axis and the output on the vertical axis. The Point-op curve in the Learn panel draws the same curve with the histograms of the open image before and after.

## Algorithm

--8<-- "filters/solarize-steps.md"

## Parameters

--8<-- "filters/solarize-params.md"

## Implementation

`solarizeFilter` in `web/src/core/filters/enhancement/point-ops.ts` uses `solarizeTransfer`. The filter is a point filter: the runner builds a table of 256 outputs once and looks up each pixel. Values between two levels, as luma often is, go through the curve directly.

## Worked example

--8<-- "examples/solarize.md"

## Complexity

--8<-- "filters/solarize-complexity.md"

## Artifacts and limitations

--8<-- "filters/solarize-limits.md"

## Tests

The reference writes the same curve with NumPy and applies it to the random test plane. Before the cases are written, the curve is checked against Pillow's `ImageOps.solarize` at four thresholds.

--8<-- "filters/solarize-tests.md"

## References

--8<-- "filters/solarize-references.md"
