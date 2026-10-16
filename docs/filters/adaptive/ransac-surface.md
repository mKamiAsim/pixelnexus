# RANSAC surface fit

--8<-- "filters/ransac-surface-facts.md"

## Overview

The RANSAC surface fit removes uneven lighting. It fits a smooth polynomial surface to the brightness of the background with random sample consensus, after Fischler and Bolles, and subtracts it. Objects on the background are outliers, so they do not bend the surface, as they would with a plain fit or a large blur. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. Two rectangles, one light and one dark, on a gray background that brightens to the right. The corrected image has an even gray background with both rectangles kept. The background panel is a smooth gray ramp with no trace of the rectangles. The inliers panel shows a grid of yellow dots over the darkened background, with no dots on the rectangles.](../../assets/figures/ransac-surface-light.svg#only-light){ width="480" }
  ![Four panels. Two rectangles, one light and one dark, on a gray background that brightens to the right. The corrected image has an even gray background with both rectangles kept. The background panel is a smooth gray ramp with no trace of the rectangles. The inliers panel shows a grid of yellow dots over the darkened background, with no dots on the rectangles.](../../assets/figures/ransac-surface-dark.svg#only-dark){ width="480" }
  <figcaption>Two rectangles on a background that brightens to the right, with a slight bend. Then the corrected image, the fitted background, and the grid samples taken as background in yellow.</figcaption>
</figure>

## How it works

--8<-- "filters/ransac-surface-steps.md"

## Mathematical foundation

--8<-- "filters/ransac-surface-formula.md"

A plain least squares fit lets every sample pull, so a large bright object lifts the surface under it. RANSAC instead fits many surfaces to small random sets of samples, and keeps the one that the most samples agree with. Samples on objects disagree with the background, so they end up outside the consensus. The final fit uses only the samples that agree.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/ransac-surface-params.md"

## Implementation

`ransac_surface` in `engine/src/pixelnexus_engine/filters/robust.py` samples the luma on a grid and passes the samples to `skimage.measure.ransac` with a polynomial surface model of our own. The coordinates x and y are scaled to -1 to 1 first, which keeps the least squares well conditioned. The random seed is fixed at 0, so the same image always gives the same result. The correction subtracts the same amount from all three channels.

## Worked example

--8<-- "examples/ransac-surface.md"

The true background has degree 2. With degree 2 and the default threshold of 10, the fitted surface is within 0.6 levels of it everywhere. Degree 1 cannot follow the bend, and misses by 9.9 to 16.7 levels. Degree 3 can follow it, but with a tight threshold of 5 only 164 samples agree, and the fit misses by 17 levels. The threshold has to sit above the noise, which is sigma 3 here.

## Complexity

--8<-- "filters/ransac-surface-complexity.md"

## Artifacts and limitations

--8<-- "filters/ransac-surface-limits.md"

## Tests

The monomials must come out in a fixed order. On a lit scene with two rectangles, degree 2 must recover the background within 3 levels, take no sample on the bright rectangle, and leave an even ground. Degree 1 must miss by more than 5 levels. The output must repeat from run to run, and too small a grid for the degree must stop with a message. The representation must have its four stages.

--8<-- "filters/ransac-surface-tests.md"

## References

--8<-- "filters/ransac-surface-references.md"
