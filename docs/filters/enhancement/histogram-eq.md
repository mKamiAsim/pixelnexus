# Histogram equalization

--8<-- "filters/histogram-eq-facts.md"

## Overview

Histogram equalization remaps brightness so that each level is used about equally often. Where many pixels share a narrow range of values, that range spreads out, and the contrast there goes up. It needs no parameters.

<figure markdown="span">
  ![Two panels: a gray, low-contrast image of blurred disks, and the equalized image with bright disks on a mid-gray background.](../../assets/figures/histogram-eq-light.svg#only-light){ width="480" }
  ![Two panels: a gray, low-contrast image of blurred disks, and the equalized image with bright disks on a mid-gray background.](../../assets/figures/histogram-eq-dark.svg#only-dark){ width="480" }
  <figcaption>Blurred disks pressed into the values 90 to 150, before and after histogram equalization.</figcaption>
</figure>

## How it works

1. Count how many pixels have each level.
2. Add the counts up from level 0, the cumulative histogram.
3. Divide by the number of pixels and multiply by 255.
4. Use the result as the new value for each level.

## Mathematical foundation

--8<-- "filters/histogram-eq-formula.md"

If the values were continuous, the cumulative distribution function would map them to a uniform distribution. With 8-bit levels, all pixels at one level must move together, so the output histogram is only roughly flat. A level held by many pixels gets a big step up the curve. Levels that no pixel uses get no step at all.

## Kernel or operator

The curve depends on the image, so the Inspector shows its formula. The Point-op curve in the Learn panel draws the curve for the open image, with the histograms before and after.

## Algorithm

--8<-- "filters/histogram-eq-steps.md"

## Parameters

--8<-- "filters/histogram-eq-params.md"

## Implementation

`histogramEqFilter` in `web/src/core/filters/enhancement/histogram.ts` builds the curve with `equalizeTable`. `histogram256` counts the levels of the whole plane, and `applyTable` applies the curve, interpolating between levels. The filter is global, so it always sees the whole image.

## Worked example

--8<-- "examples/histogram-eq.md"

## Complexity

--8<-- "filters/histogram-eq-complexity.md"

## Artifacts and limitations

--8<-- "filters/histogram-eq-limits.md"

## Tests

The reference builds the cumulative histogram of the test plane with NumPy and applies it.

--8<-- "filters/histogram-eq-tests.md"

## References

--8<-- "filters/histogram-eq-references.md"
