# SIFT

--8<-- "filters/sift-facts.md"

## Overview

SIFT, the scale-invariant feature transform of Lowe, finds keypoints that stay the same when the image is scaled or turned. It looks for blobs of any size in a difference-of-Gaussians scale space, refines their position and size, drops weak points and points on edges, and gives each one an orientation. The keypoints go to the Features panel and are drawn on the canvas. Only the detector runs, not the descriptor. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels: a Siemens star with 36 spokes, and SIFT keypoints as rings with angle lines. On the star, small rings sit only near the rim, where the spokes meet the gray ground. The turned star shows the same rings in the turned places. On the Disks image, large rings fill the disks, several with many angle lines from one center.](../../assets/figures/sift-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star with 36 spokes, and SIFT keypoints as rings with angle lines. On the star, small rings sit only near the rim, where the spokes meet the gray ground. The turned star shows the same rings in the turned places. On the Disks image, large rings fill the disks, several with many angle lines from one center.](../../assets/figures/sift-dark.svg#only-dark){ width="480" }
  <figcaption>The keypoints with the defaults on the Siemens star, on the star turned a quarter counterclockwise, and on the Disks image. Each keypoint is a ring of its radius with a line along its angle.</figcaption>
</figure>

## How it works

--8<-- "filters/sift-steps.md"

## Mathematical foundation

--8<-- "filters/sift-formula.md"

A Gaussian scale space blurs the image more and more. SIFT groups the blurs into octaves, where the blur doubles, with a fixed number of layers in each. The difference of two neighboring blurs approximates the scale-normalized Laplacian, so blobs give extrema. A candidate is a point larger or smaller than all 26 neighbors in position and scale.

Each candidate is refined by fitting a quadratic to D around it. Points whose refined value is too small are dropped, since they sit in flat areas. Points on edges are dropped too. Along an edge, D bends much more across than along, so the ratio tr(H)^2 / det H of the curvatures is large. Finally, a histogram of 36 gradient directions around the point gives its orientation. Each peak within 80 percent of the highest gives one more keypoint at the same place.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They start with the 8-bit luma and follow the detector step by step. They summarize what OpenCV does, so the label is Simplified.

## Parameters

--8<-- "filters/sift-params.md"

## Implementation

`sift` in `engine/src/pixelnexus_engine/filters/keypoints.py` calls `cv2.SIFT_create` with the catalog values and `detect` on the 8-bit luma. Each keypoint becomes a row with x, y, the radius (half of OpenCV's size), the angle, the score (OpenCV's response) and the octave. SIFT packs octave, layer and scale into one number, so the octave is its lowest byte, read as a signed number.

OpenCV puts the center of the top-left pixel at 0, 0, as the feature tables do, so positions keep their fraction. OpenCV measures angles clockwise in image coordinates, where y points down. The table turns them to count counterclockwise from the x axis, as (360 - angle) mod 360. The rows are sorted by score. With a selection, the detector still looks at the whole image, and only the keypoints on selected pixels are kept.

## Worked example

--8<-- "examples/sift.md"

## Complexity

--8<-- "filters/sift-complexity.md"

## Artifacts and limitations

--8<-- "filters/sift-limits.md"

## Tests

The table must hold what `cv2.SIFT_create` finds, with the angle turned to count counterclockwise, sorted by score. After a quarter turn of the Siemens star, at least 80 percent of the keypoints must come back at the turned place with an angle 90 degrees larger. This test is what proves the direction of the angles. The octave must be the signed lowest byte. A flat image must give no keypoints, and runs must repeat exactly. The engine API tests check the JSON and the stages.

--8<-- "filters/sift-tests.md"

## References

--8<-- "filters/sift-references.md"
