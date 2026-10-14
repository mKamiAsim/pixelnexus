# Niblack threshold

--8<-- "filters/niblack-facts.md"

## Overview

Niblack's method sets the threshold of each pixel at the local mean plus k times the local standard deviation. The deviation lets the threshold follow the local contrast as well as the local brightness.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and some speckle between them.](../../assets/figures/niblack-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and some speckle between them.](../../assets/figures/niblack-dark.svg#only-dark){ width="480" }
  <figcaption>Niblack threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Find the mean and the standard deviation of the window.
2. Set the threshold to m + k s.
3. Make the pixel white if it is brighter than the threshold.

## Mathematical foundation

--8<-- "filters/niblack-formula.md"

In a flat area the deviation is small, so the threshold sits close to the mean and noise decides each pixel. That is the speckle Niblack's method is known for. Running sums of the values and of their squares give the mean and the variance at the same cost for any window size.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/niblack-steps.md"

## Parameters

--8<-- "filters/niblack-params.md"

## Implementation

`niblackFilter` in `web/src/core/filters/segmentation/thresholds.ts` uses `localMoments`, shared with the local statistics filters.

## Worked example

--8<-- "examples/niblack.md"

## Complexity

--8<-- "filters/niblack-complexity.md"

## Artifacts and limitations

--8<-- "filters/niblack-limits.md"

## Tests

The fixture cases come from scikit-image's threshold_niblack, with its k of the opposite sign on the random test plane, and compare every output pixel.

--8<-- "filters/niblack-tests.md"

## References

--8<-- "filters/niblack-references.md"
