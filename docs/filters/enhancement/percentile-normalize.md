# Percentile normalization

--8<-- "filters/percentile-normalize-facts.md"

## Overview

Percentile normalization stretches the image so that its darkest few percent become black and its brightest few percent become white. It finds the stretch from the image itself. Unlike min-max normalization, a few extreme pixels cannot stop it.

<figure markdown="span">
  ![Three panels: a gray, low-contrast image of blurred disks with a few black and white specks, the same image after min-max normalization, which looks unchanged, and after normalization with percentiles 1 and 99, with bright disks on a black background.](../../assets/figures/percentile-normalize-light.svg#only-light){ width="480" }
  ![Three panels: a gray, low-contrast image of blurred disks with a few black and white specks, the same image after min-max normalization, which looks unchanged, and after normalization with percentiles 1 and 99, with bright disks on a black background.](../../assets/figures/percentile-normalize-dark.svg#only-dark){ width="480" }
  <figcaption>A low-contrast image with a few specks, stretched with percentiles 0 and 100 and with 1 and 99.</figcaption>
</figure>

## How it works

1. Count how many pixels have each level.
2. Find the levels at the low and the high percentile.
3. Map the low one to 0 and the high one to 255 with a straight line.
4. Clip everything outside to 0 or 255.

## Mathematical foundation

--8<-- "filters/percentile-normalize-formula.md"

A percentile is a value below which a given share of the pixels lies. The filter uses the linear rule of numpy.percentile. It sorts the values, finds the position (N - 1) q / 100, and interpolates between the two values next to it. The histogram gives the sorted values without sorting, since all values are levels from 0 to 255.

## Kernel or operator

The curve depends on the image, so the Inspector shows its formula. The Point-op curve in the Learn panel draws the curve for the open image, with the histograms before and after.

## Algorithm

--8<-- "filters/percentile-normalize-steps.md"

## Parameters

--8<-- "filters/percentile-normalize-params.md"

## Implementation

`percentileNormalizeFilter` in `web/src/core/filters/enhancement/histogram.ts` finds the percentiles with `histogramPercentile` and builds the curve with `percentileTable`. `histogram256` counts the levels of the whole plane, and `applyTable` applies the curve, interpolating between levels. The filter is global, so it always sees the whole image.

## Worked example

--8<-- "examples/percentile-normalize.md"

## Complexity

--8<-- "filters/percentile-normalize-complexity.md"

## Artifacts and limitations

--8<-- "filters/percentile-normalize-limits.md"

## Tests

The reference uses `numpy.percentile` on the test plane and the same clipped line. The cases include percentiles 0 and 100, and equal percentiles, where the image stays as it is.

--8<-- "filters/percentile-normalize-tests.md"

## References

--8<-- "filters/percentile-normalize-references.md"
