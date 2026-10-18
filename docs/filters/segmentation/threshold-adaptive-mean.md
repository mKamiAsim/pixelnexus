# Adaptive mean threshold

--8<-- "filters/threshold-adaptive-mean-facts.md"

## Overview

The adaptive mean threshold compares each pixel with the mean of its own neighborhood, lowered by an offset. Slow changes of lighting move the mean along with the pixel, so they do not change the result.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes across the whole page.](../../assets/figures/threshold-adaptive-mean-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes across the whole page.](../../assets/figures/threshold-adaptive-mean-dark.svg#only-dark){ width="480" }
  <figcaption>Adaptive mean threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Average the window around each pixel.
2. Subtract the offset.
3. Make the pixel white if it is brighter than the result.

## Mathematical foundation

--8<-- "filters/threshold-adaptive-mean-formula.md"

A pixel turns white when it is brighter than its surroundings by more than the offset. So the threshold follows the local background. The window must be larger than the strokes, or the strokes pull the mean down and break up.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/threshold-adaptive-mean-steps.md"

## Parameters

--8<-- "filters/threshold-adaptive-mean-params.md"

## Implementation

`adaptiveMeanFilter` in `web/src/core/filters/segmentation/thresholds.ts` uses the running box mean `boxMean`.

## Worked example

--8<-- "examples/threshold-adaptive-mean.md"

## Complexity

--8<-- "filters/threshold-adaptive-mean-complexity.md"

## Artifacts and limitations

--8<-- "filters/threshold-adaptive-mean-limits.md"

## Tests

The fixture cases come from scikit-image's threshold_local with the mean method on the random test plane, and compare every output pixel.

--8<-- "filters/threshold-adaptive-mean-tests.md"

## References

--8<-- "filters/threshold-adaptive-mean-references.md"
