# BRISK

--8<-- "filters/brisk-facts.md"

## Overview

BRISK finds corner keypoints with their scale and orientation. It looks for AGAST corners, an adaptive form of FAST, in a scale space of octaves and the intra-octaves between them. It keeps the corners that stand out in position and scale, refines them, and gives each an orientation. The keypoints go to the Features panel and are drawn on the canvas. Only the detector runs, not the binary descriptor. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels: a Siemens star and BRISK keypoints as rings. On the star, rings of many sizes cluster at four places on the rim and form a band around the middle. The turned star shows similar clusters. On the Disks image, rings of several sizes sit on the disk edges.](../../assets/figures/brisk-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star and BRISK keypoints as rings. On the star, rings of many sizes cluster at four places on the rim and form a band around the middle. The turned star shows similar clusters. On the Disks image, rings of several sizes sit on the disk edges.](../../assets/figures/brisk-dark.svg#only-dark){ width="480" }
  <figcaption>The keypoints with the defaults on the Siemens star, on the star turned a quarter counterclockwise, and on the Disks image. Each keypoint is a ring of its radius with a line along its angle.</figcaption>
</figure>

## How it works

--8<-- "filters/brisk-steps.md"

## Mathematical foundation

--8<-- "filters/brisk-formula.md"

The scale space of BRISK has octaves, each half the size of the one before, and intra-octaves between them. The first intra-octave is the image shrunk by 1.5. In every layer, BRISK finds AGAST corners and their FAST score s, the largest threshold at which the point is still a corner.

A corner is kept when its score beats its 8 neighbors in its own layer and the scores in the layers above and below. Its position and scale are refined by fitting quadratics to the scores. The orientation comes from the BRISK sampling pattern, a set of points on rings around the keypoint. For the pairs of points that are far apart, the local gradient is the difference of their smoothed values over their distance. The mean of these gradients gives the orientation.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They start with the 8-bit luma and follow the detector step by step. They summarize what OpenCV does, so the label is Simplified.

## Parameters

--8<-- "filters/brisk-params.md"

## Implementation

`brisk` in `engine/src/pixelnexus_engine/filters/keypoints.py` calls `cv2.xfeatures2d.BRISK_create` with the threshold and the number of octaves, and `detect` on the 8-bit luma. OpenCV 5 keeps BRISK in `cv2.xfeatures2d`. The table has x, y, the radius, the angle, the score and the octave.

OpenCV puts the center of the top-left pixel at 0, 0, as the feature tables do, so positions keep their fraction. OpenCV measures angles clockwise in image coordinates, where y points down. The table turns them to count counterclockwise from the x axis, as (360 - angle) mod 360. The rows are sorted by score. With a selection, the detector still looks at the whole image, and only the keypoints on selected pixels are kept.

## Worked example

--8<-- "examples/brisk.md"

## Complexity

--8<-- "filters/brisk-complexity.md"

## Artifacts and limitations

--8<-- "filters/brisk-limits.md"

## Tests

The table must hold what OpenCV's BRISK finds, with the angle turned to count counterclockwise, sorted by score. The detector must come from `cv2.xfeatures2d`. A flat image must give no keypoints, and runs must repeat exactly. The engine API tests check the JSON and the stages.

--8<-- "filters/brisk-tests.md"

## References

--8<-- "filters/brisk-references.md"
