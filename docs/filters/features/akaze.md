# AKAZE

--8<-- "filters/akaze-facts.md"

## Overview

AKAZE finds keypoints in a nonlinear scale space. Unlike a Gaussian blur, nonlinear diffusion smooths flat areas but keeps edges, so keypoints sit well on object boundaries. Keypoints are maxima of the Hessian determinant, each with a size and an orientation. The keypoints go to the Features panel and are drawn on the canvas. Only the detector runs, not the descriptor. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels: a Siemens star and AKAZE keypoints as small rings. On the star, small rings form a circle halfway out and line the rim, with none near the center. The turned star looks the same. On the Disks image, small rings line the edges of the disks.](../../assets/figures/akaze-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star and AKAZE keypoints as small rings. On the star, small rings form a circle halfway out and line the rim, with none near the center. The turned star looks the same. On the Disks image, small rings line the edges of the disks.](../../assets/figures/akaze-dark.svg#only-dark){ width="480" }
  <figcaption>The keypoints with the defaults on the Siemens star, on the star turned a quarter counterclockwise, and on the Disks image. Each keypoint is a ring of its radius with a line along its angle.</figcaption>
</figure>

## How it works

--8<-- "filters/akaze-steps.md"

## Mathematical foundation

--8<-- "filters/akaze-formula.md"

Linear scale space is the heat equation: the image diffuses the same way everywhere, so edges blur as much as flat areas. Nonlinear diffusion multiplies the flow by a conductance g that falls where the gradient of the slightly blurred image L_sigma is large. Flat areas then smooth fast, and strong edges hardly move. The contrast factor k sets which gradients count as strong. AKAZE takes it from the gradients of the image.

KAZE solved the diffusion with implicit steps, which are slow. AKAZE uses fast explicit diffusion, explicit steps of varying length that stay stable over a whole cycle, so it is much faster. In the resulting scale space, keypoints are maxima of the Hessian determinant above the threshold, with derivatives scaled to each level. The orientation is the dominant direction of the first derivatives in a circle around the keypoint, found with a window of 60 degrees that slides around the circle.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They start with the 8-bit luma and follow the detector step by step. They summarize what OpenCV does, so the label is Simplified.

## Parameters

--8<-- "filters/akaze-params.md"

## Implementation

`akaze` in `engine/src/pixelnexus_engine/filters/keypoints.py` calls `cv2.xfeatures2d.AKAZE_create` with the threshold, octaves, layers and diffusivity, and `detect` on the 8-bit luma. OpenCV 5 keeps AKAZE in `cv2.xfeatures2d`. The table has x, y, the radius, the angle, the score and the octave.

OpenCV puts the center of the top-left pixel at 0, 0, as the feature tables do, so positions keep their fraction. OpenCV measures angles clockwise in image coordinates, where y points down. The table turns them to count counterclockwise from the x axis, as (360 - angle) mod 360. The rows are sorted by score. With a selection, the detector still looks at the whole image, and only the keypoints on selected pixels are kept.

## Worked example

--8<-- "examples/akaze.md"

## Complexity

--8<-- "filters/akaze-complexity.md"

## Artifacts and limitations

--8<-- "filters/akaze-limits.md"

## Tests

The table must hold what OpenCV's AKAZE finds, with the angle turned to count counterclockwise, sorted by score. The defaults must reach OpenCV, including the Perona-Malik g2 diffusivity. A flat image must give no keypoints, and runs must repeat exactly. The engine API tests check the JSON and the stages.

--8<-- "filters/akaze-tests.md"

## References

--8<-- "filters/akaze-references.md"
