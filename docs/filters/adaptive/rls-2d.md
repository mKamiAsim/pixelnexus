# 2D RLS adaptive filter

--8<-- "filters/rls-2d-facts.md"

## Overview

The 2D RLS filter predicts each pixel from its neighbors, like the [2D LMS filter](lms-2d.md). Its update is recursive least squares (RLS). At every pixel, the weights are the best least-squares fit to all pixels before it, with older pixels counting a little less. It gets there without solving the fit again: it carries the inverse of the correlation matrix, P, from pixel to pixel.

RLS learns within a few pixels, where LMS needs thousands. The price is more work per pixel.

<figure markdown="span">
  ![Three panels: the Disks and dots test image with strong noise, the RLS prediction with much less noise, and the RLS error, gray noise with the disk outlines.](../../assets/figures/rls-2d-light.svg#only-light){ width="480" }
  ![Three panels: the Disks and dots test image with strong noise, the RLS prediction with much less noise, and the RLS error, gray noise with the disk outlines.](../../assets/figures/rls-2d-dark.svg#only-dark){ width="480" }
  <figcaption>RLS learns within the first rows. Its error shows the noise and the outlines.</figcaption>
</figure>

## How it works

1. Guess the pixel from its neighbors with the current weights.
2. Compare the guess with the pixel.
3. Move the weights to the best fit of all pixels so far, using a running summary instead of solving again.
4. Go on to the next pixel, row by row.

## Mathematical foundation

--8<-- "filters/rls-2d-formula.md"

With a forgetting factor below 1, a pixel n steps back counts lambda to the power n. That lets the weights follow changes in the image. It also has a danger. In a flat area the neighbors are all alike, so the pixels add no new information about most directions of w. P then grows by 1 / lambda at every step in those directions. After a few thousand flat pixels it is huge, and the next edge throws the weights far off. This is called windup. In tests, a flat image of 200 x 200 pixels drove the plain update to errors of about 150,000 levels at lambda 0.999.

The studio guards against it. After each step, P is made exactly symmetric again, and its trace is capped at its starting value. With this safeguard, the same flat image stays within a few levels.

## Kernel or operator

There is no fixed kernel. The weights change at every pixel. The Inspector shows the prediction and the update with the current values.

## Algorithm

--8<-- "filters/rls-2d-steps.md"

## Parameters

--8<-- "filters/rls-2d-params.md"

## Implementation

`rlsPlane` in `web/src/core/filters/adaptive/scan.ts` scans the image in raster order and carries the weights and P from pixel to pixel. Values are scaled to 0 to 1. The scan cannot be cut into tiles, so the filter runs on the whole image at once.

## Worked example

--8<-- "examples/rls-2d.md"

RLS does best on the stripes, and stays close to the fixed filters on the disks. It reaches its weights faster than LMS, so less of the image is filtered with poor weights.

## Complexity

--8<-- "filters/rls-2d-complexity.md"

## Artifacts and limitations

--8<-- "filters/rls-2d-limits.md"

## Tests

A NumPy loop of the same update, with the same safeguard, in `tools/fixtures_scan.py`, gives the reference. Before it is used, the script checks two things. With lambda 1, the prediction at three pixels must equal the regularized least-squares fit to all pixels before them, solved directly with `numpy.linalg.solve`. And on a flat image, lambda 0.99 must stay bounded.

--8<-- "filters/rls-2d-tests.md"

## References

--8<-- "filters/rls-2d-references.md"
