# Bradley threshold

--8<-- "filters/bradley-facts.md"

## Overview

Bradley and Roth compare each pixel with the mean of the window around it. A pixel turns black when it is at least t percent darker than that mean. An integral image gives every window sum in constant time, so the method is fast enough for live video.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and a clean background.](../../assets/figures/bradley-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, with clean strokes and a clean background.](../../assets/figures/bradley-dark.svg#only-dark){ width="480" }
  <figcaption>Bradley threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Find the mean of the window.
2. Lower it by t percent.
3. Make the pixel black if it is not brighter than the result, and white otherwise.

## Mathematical foundation

--8<-- "filters/bradley-formula.md"

The threshold is a fixed fraction of the mean. If a shadow makes a region darker by a factor, the mean and the pixel change by the same factor, so the result stays the same. The adaptive mean threshold subtracts a fixed offset instead, which suits noise of a fixed size better than changes of lighting.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/bradley-steps.md"

## Parameters

--8<-- "filters/bradley-params.md"

## Implementation

`bradleyFilter` in `web/src/core/filters/segmentation/thresholds.ts` sums the windows with `windowSumOf`, shared with the rank and local statistics filters.

## Worked example

--8<-- "examples/bradley.md"

## Complexity

--8<-- "filters/bradley-complexity.md"

## Artifacts and limitations

--8<-- "filters/bradley-limits.md"

## Tests

The fixture cases come from a NumPy reference that follows the paper: an integral image of the plane padded with the border mode, and the comparison with the lowered mean. Before the cases are written, the reference with t = 0 is checked against the mean of scikit-image's threshold_local for all five border modes. Unit tests check that t = 0 thresholds at the local mean and that a darker copy of an image gives the same result. One more test puts a dark pixel on each side of the threshold.

--8<-- "filters/bradley-tests.md"

## References

--8<-- "filters/bradley-references.md"
