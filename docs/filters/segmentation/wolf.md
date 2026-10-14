# Wolf threshold

--8<-- "filters/wolf-facts.md"

## Overview

Wolf, Jolion and Chassaing changed Sauvola's rule so that it fits images with low contrast, such as text in video frames. The threshold is measured from the darkest value of the image, and the range of contrast comes from the image itself.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and a clean background.](../../assets/figures/wolf-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and a clean background.](../../assets/figures/wolf-dark.svg#only-dark){ width="480" }
  <figcaption>Wolf threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Find the mean and the standard deviation of the window.
2. Find the darkest value M of the image and the largest standard deviation R of all windows.
3. Set the threshold to (1 - k) m + k M + k (s / R) (m - M).
4. Make the pixel white if it is brighter than the threshold.

## Mathematical foundation

--8<-- "filters/wolf-formula.md"

Written as T = m - k (1 - s / R) (m - M), the rule shows how it relates to Sauvola's, T = m - k (1 - s / R) m. Sauvola measures from 0 with a fixed range R. Wolf measures from the darkest value M and takes R from the image. In the busiest window of the image, s = R and the threshold is the mean. In a flat window, the threshold moves from the mean toward M by the fraction k.

M and R depend on the whole image, so this is a global filter. It runs on the whole image even when a selection is active, and a selection only limits where the result is blended in.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/wolf-steps.md"

## Parameters

--8<-- "filters/wolf-params.md"

## Implementation

`wolfFilter` in `web/src/core/filters/segmentation/thresholds.ts` calls `wolfThresholds`, which uses `localMoments`, shared with the local statistics filters.

## Worked example

--8<-- "examples/wolf.md"

## Complexity

--8<-- "filters/wolf-complexity.md"

## Artifacts and limitations

--8<-- "filters/wolf-limits.md"

## Tests

The fixture cases come from a NumPy reference that sums windows with an integral image of the padded plane. Before the cases are written, the reference is checked against OpenCV's niBlackThreshold with BINARIZATION_WOLF and the replicate border on two images. Unit tests check that k = 0 thresholds at the local mean, that k = 1 gives M + (s / R) (m - M), and that a flat image turns all 0.

--8<-- "filters/wolf-tests.md"

## References

--8<-- "filters/wolf-references.md"
