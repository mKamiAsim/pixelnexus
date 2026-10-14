# Adaptive Gaussian threshold

--8<-- "filters/threshold-adaptive-gaussian-facts.md"

## Overview

The adaptive Gaussian threshold compares each pixel with a Gaussian weighted mean of its neighborhood, lowered by an offset. Near pixels count more than far ones, which follows the background more closely than a plain mean.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes across the whole page.](../../assets/figures/threshold-adaptive-gaussian-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes across the whole page.](../../assets/figures/threshold-adaptive-gaussian-dark.svg#only-dark){ width="480" }
  <figcaption>Adaptive Gaussian threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Blur the image with a Gaussian of sigma (size - 1) / 6.
2. Subtract the offset.
3. Make the pixel white if it is brighter than the result.

## Mathematical foundation

--8<-- "filters/threshold-adaptive-gaussian-formula.md"

The Gaussian is the same local mean with smooth weights. scikit-image derives its sigma from the block size as (size - 1) / 6. So the window holds about plus and minus 3 sigma. The kernel is cut at 4 sigma.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/threshold-adaptive-gaussian-steps.md"

## Parameters

--8<-- "filters/threshold-adaptive-gaussian-params.md"

## Implementation

`adaptiveGaussianFilter` in `web/src/core/filters/segmentation/thresholds.ts` blurs with `gaussianMean`, two 1D passes of the Gaussian.

## Worked example

--8<-- "examples/threshold-adaptive-gaussian.md"

## Complexity

--8<-- "filters/threshold-adaptive-gaussian-complexity.md"

## Artifacts and limitations

--8<-- "filters/threshold-adaptive-gaussian-limits.md"

## Tests

The fixture cases come from scikit-image's threshold_local with the Gaussian method on the random test plane, and compare every output pixel.

--8<-- "filters/threshold-adaptive-gaussian-tests.md"

## References

--8<-- "filters/threshold-adaptive-gaussian-references.md"
