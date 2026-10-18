# Log transformation

--8<-- "filters/log-transform-facts.md"

## Overview

The log transformation brightens dark values strongly and bright values only a little. It suits images whose values span a huge range, such as a Fourier spectrum, where the few large values would hide everything else.

<figure markdown="span">
  ![A plot of output value against input value. The log curve rises steeply near 0 and flattens toward 255, above the straight line of no change.](../../assets/figures/log-transform-light.svg#only-light){ width="480" }
  ![A plot of output value against input value. The log curve rises steeply near 0 and flattens toward 255, above the straight line of no change.](../../assets/figures/log-transform-dark.svg#only-dark){ width="480" }
  <figcaption>The log transformation compared with no change.</figcaption>
</figure>

## How it works

1. Add 1 to the value, so that 0 stays defined.
2. Take the natural logarithm.
3. Multiply by 255 / ln 256, so that 255 maps to 255.

## Mathematical foundation

--8<-- "filters/log-transform-formula.md"

The slope of c ln(1 + r) is c / (1 + r). Near 0 the slope is about 46, so small differences in the shadows grow a lot. Near 255 the slope is about 0.18, so the highlights are pressed together. Gonzalez and Woods use the same curve to display Fourier spectra.

## Kernel or operator

The Inspector draws the transfer curve for the current settings, with the input value on the horizontal axis and the output on the vertical axis. The Point-op curve in the Learn panel draws the same curve with the histograms of the open image before and after.

## Algorithm

--8<-- "filters/log-transform-steps.md"

## Parameters

--8<-- "filters/log-transform-params.md"

## Implementation

`logTransformFilter` in `web/src/core/filters/enhancement/point-ops.ts` uses `logTransfer`. The filter is a point filter: the runner builds a table of 256 outputs once and looks up each pixel. Values between two levels, as luma often is, go through the curve directly.

## Worked example

--8<-- "examples/log-transform.md"

## Complexity

--8<-- "filters/log-transform-complexity.md"

## Artifacts and limitations

--8<-- "filters/log-transform-limits.md"

## Tests

The reference writes the same curve with NumPy and applies it to the random test plane.

--8<-- "filters/log-transform-tests.md"

## References

--8<-- "filters/log-transform-references.md"
