# ORB

--8<-- "filters/orb-facts.md"

## Overview

ORB finds corners fast. It looks for FAST corners on each level of an image pyramid and ranks them by the Harris measure. It keeps the strongest and gives each one an orientation from its intensity centroid. The keypoints go to the Features panel and are drawn on the canvas. Only the detector runs, not the binary descriptor. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels: a Siemens star and ORB keypoints as rings. On the star, a dense band of large rings circles the middle, where the spokes are a few pixels wide, and a few large rings sit on the rim at the four diagonals. The turned star looks the same. On the Disks image, many large overlapping rings crowd around the disk edges.](../../assets/figures/orb-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star and ORB keypoints as rings. On the star, a dense band of large rings circles the middle, where the spokes are a few pixels wide, and a few large rings sit on the rim at the four diagonals. The turned star looks the same. On the Disks image, many large overlapping rings crowd around the disk edges.](../../assets/figures/orb-dark.svg#only-dark){ width="480" }
  <figcaption>The keypoints with the defaults on the Siemens star, on the star turned a quarter counterclockwise, and on the Disks image. Each keypoint is a ring of its radius with a line along its angle.</figcaption>
</figure>

## How it works

--8<-- "filters/orb-steps.md"

## Mathematical foundation

--8<-- "filters/orb-formula.md"

FAST is a fast corner test. Around a pixel p, it looks at the circle of 16 pixels at radius 3. If 9 of them in a row are all brighter than p by more than the threshold, or all darker, p is a corner. OpenCV keeps only corners that are stronger than their neighbors.

FAST responds to edges too. So ORB ranks the corners by the Harris measure det M - 0.04 tr(M)^2, with the structure tensor M of a 7 x 7 window. The strongest over all pyramid levels are kept. The orientation comes from the intensity centroid. The moments m_10 and m_01 of the brightness in a disk 31 pixels wide point from the corner toward its brighter side. The angle of that vector is the orientation.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They start with the 8-bit luma and follow the detector step by step. They summarize what OpenCV does, so the label is Simplified.

## Parameters

--8<-- "filters/orb-params.md"

## Implementation

`orb` in `engine/src/pixelnexus_engine/filters/keypoints.py` calls `cv2.ORB_create` with the catalog values, a border and patch size of 31, and `detect` on the 8-bit luma. The table has x, y, the radius, the angle, the score and the pyramid level as the octave.

OpenCV puts the center of the top-left pixel at 0, 0, as the feature tables do, so positions keep their fraction. OpenCV measures angles clockwise in image coordinates, where y points down. The table turns them to count counterclockwise from the x axis, as (360 - angle) mod 360. The rows are sorted by score. With a selection, the detector still looks at the whole image, and only the keypoints on selected pixels are kept.

## Worked example

--8<-- "examples/orb.md"

## Complexity

--8<-- "filters/orb-complexity.md"

## Artifacts and limitations

--8<-- "filters/orb-limits.md"

## Tests

The table must hold what `cv2.ORB_create` finds, with the angle turned to count counterclockwise, sorted by score. On the Disks image, the FAST threshold of 20 must give 355 keypoints and a threshold of 5 must give 443. A flat image must give no keypoints, and runs must repeat exactly. The engine API tests check the JSON and the stages.

--8<-- "filters/orb-tests.md"

## References

--8<-- "filters/orb-references.md"
