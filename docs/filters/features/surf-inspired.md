# SURF-inspired detector

--8<-- "filters/surf-inspired-facts.md"

## Overview

The SURF-inspired detector finds blob keypoints with the Fast-Hessian detector of SURF, by Bay and coworkers. It approximates the Hessian with box filters on the integral image, so a large filter costs as much as a small one. Each keypoint gets a size, an orientation from Haar wavelets, and the sign of its Laplacian. SURF itself is patented and missing from the default builds of OpenCV, so this is PixelNexus's own code after the paper. Only the detector and the orientation are built, not the descriptor. The keypoints go to the Features panel and are drawn on the canvas.

<figure markdown="span">
  ![Four panels: a Siemens star with 36 spokes, and SURF-inspired keypoints as small rings with angle lines. On the star, many small rings sit along the spokes and the rim. The turned star shows the same rings in the turned places. On the Disks image, rings sit inside three of the smaller disks only.](../../assets/figures/surf-inspired-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star with 36 spokes, and SURF-inspired keypoints as small rings with angle lines. On the star, many small rings sit along the spokes and the rim. The turned star shows the same rings in the turned places. On the Disks image, rings sit inside three of the smaller disks only.](../../assets/figures/surf-inspired-dark.svg#only-dark){ width="480" }
  <figcaption>The keypoints with the defaults on the Siemens star, on the star turned a quarter counterclockwise, and on the Disks image. Each keypoint is a ring of its sigma with a line along its angle.</figcaption>
</figure>

## How it works

--8<-- "filters/surf-inspired-steps.md"

## Mathematical foundation

--8<-- "filters/surf-inspired-formula.md"

The integral image S holds at each point the sum of all pixels above and to the left. The sum over any box then takes four lookups: S at its four corners. This is the trick behind SURF's speed.

The second derivatives of a Gaussian look like a positive bump between two negative lobes, or four lobes of alternating sign for the mixed derivative. SURF replaces them by boxes of constant weight. A filter of size L = 3 l has lobes of l pixels. D_yy has three lobes of l rows and 2 l - 1 columns, with weights 1, -2 and 1, and D_xx is the same turned. D_xy has four lobes of l x l, one pixel away from the center row and column. The smallest filter, 9 x 9, stands for a Gaussian of sigma 1.2, so a filter of size L stands for sigma = 1.2 L / 9. Each response is divided by L^2, so all sizes give comparable values.

The weight 0.9 balances the box D_xy against the other two, since boxes are not exact Gaussian derivatives. Bay and coworkers found it from the Frobenius norms of the filters. Keypoints are maxima of the determinant over their 26 neighbors in position and filter size, above the threshold. Since the octaves overlap in size, a blob can appear in two octaves.

For the orientation, Haar wavelets of side about 4 s measure the change in x and in y. They sit on a grid of step s within a radius of 6 s around the keypoint. A Gaussian of 2 s weights them. A window of 60 degrees slides around the circle, and the longest sum of the responses inside it gives the angle.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the integral image, the box Hessian with the filter sizes of each octave, the maxima, and the orientation when it is on.

## Parameters

--8<-- "filters/surf-inspired-params.md"

## Implementation

`surf_inspired` in `engine/src/pixelnexus_engine/filters/surf.py` builds the integral image of the luma from 0 to 1. The `hessian_boxes` function computes the three box responses of one filter size at every pixel with whole-array lookups, and `detect` finds the maxima with a 3 x 3 x 3 maximum filter. A blob centered between two pixels gives two equal maxima side by side, so only the first of each touching group stays. The `orientation` function samples the Haar wavelets. They span 4 s + 1 pixels and leave out the center row or column, so a quarter turn of the image turns the responses exactly. The window moves in steps of 5 degrees, which is our choice.

This code differs from SURF in three ways. It computes the responses at every pixel instead of at a coarser step in the higher octaves. It does not refine positions and sizes between pixels and filter sizes. And it builds no descriptor. The table has x and y, sigma, the filter size, the angle and the determinant as the score. Its last column is the sign of the Laplacian D_xx + D_yy, which is negative for bright blobs.

## Worked example

--8<-- "examples/surf-inspired.md"

On the Disks image, each disk looks the same in every direction, so its angle has no meaning, and a quarter turn rarely gives the turned angle. The Siemens star has a clear direction at every keypoint.

## Complexity

--8<-- "filters/surf-inspired-complexity.md"

## Artifacts and limitations

--8<-- "filters/surf-inspired-limits.md"

## Tests

The box responses must equal a direct correlation with the kernels of the paper, written out as arrays, for the sizes 9, 15, 27 and 51. Each kernel must sum to 0. The filter sizes of the four octaves must be those of the paper. The score must be the box determinant with the weight 0.9. Bright disks must be found with a negative Laplacian, and dark disks at the same places with a positive one. A quarter turn of the Siemens star must give the same number of keypoints, with at least 95 percent at the turned place with the turned angle. Touching equal maxima must give one keypoint. The engine API tests check the JSON and the stages.

--8<-- "filters/surf-inspired-tests.md"

## References

--8<-- "filters/surf-inspired-references.md"
