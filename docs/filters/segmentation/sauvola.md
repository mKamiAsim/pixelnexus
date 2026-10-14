# Sauvola threshold

--8<-- "filters/sauvola-facts.md"

## Overview

Sauvola's method refines Niblack's for documents. Where the neighborhood is flat, the threshold drops well below the mean, so blank paper stays clean. Where there is text, it rises toward the mean.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and a clean background.](../../assets/figures/sauvola-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and a clean background.](../../assets/figures/sauvola-dark.svg#only-dark){ width="480" }
  <figcaption>Sauvola threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Find the mean and the standard deviation of the window.
2. Set the threshold to m (1 + k (s / R - 1)).
3. Make the pixel white if it is brighter than the threshold.

## Mathematical foundation

--8<-- "filters/sauvola-formula.md"

With no contrast, s = 0 and the threshold is m (1 - k), half the mean for k = 0.5. Noise on blank paper cannot cross that. As s grows toward R, the threshold rises toward m. The figure shows dark strokes on light paper as black on white, without Invert.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/sauvola-steps.md"

## Parameters

--8<-- "filters/sauvola-params.md"

## Implementation

`sauvolaFilter` in `web/src/core/filters/segmentation/thresholds.ts` uses `localMoments`, shared with the local statistics filters.

## Worked example

--8<-- "examples/sauvola.md"

## Complexity

--8<-- "filters/sauvola-complexity.md"

## Artifacts and limitations

--8<-- "filters/sauvola-limits.md"

## Tests

The fixture cases come from scikit-image's threshold_sauvola on the random test plane, and compare every output pixel.

--8<-- "filters/sauvola-tests.md"

## References

--8<-- "filters/sauvola-references.md"
