# Medial axis

--8<-- "filters/medial-axis-facts.md"

## Overview

The medial axis reduces each white shape to a line through its middle, the centers of the largest disks that fit inside it. Each axis pixel also carries its distance to the background, so the axis and the distances together describe the width of the shape everywhere. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. White shapes on black: a tall rectangle, a disk and an L. The axis panel shows thin white lines: a vertical line with short forks at both ends in the rectangle, a cross in the disk, and a line along the L. The distance panel shows the same lines, brightest in the middle of the disk and the rectangle. The overlay shows the yellow axis over the darkened shapes.](../../assets/figures/medial-axis-light.svg#only-light){ width="480" }
  ![Four panels. White shapes on black: a tall rectangle, a disk and an L. The axis panel shows thin white lines: a vertical line with short forks at both ends in the rectangle, a cross in the disk, and a line along the L. The distance panel shows the same lines, brightest in the middle of the disk and the rectangle. The overlay shows the yellow axis over the darkened shapes.](../../assets/figures/medial-axis-dark.svg#only-dark){ width="480" }
  <figcaption>A rectangle 24 pixels wide, a disk of radius 26 and an L of width 12. Then the medial axis, its distances, and the axis over the image.</figcaption>
</figure>

## How it works

--8<-- "filters/medial-axis-steps.md"

## Mathematical foundation

--8<-- "filters/medial-axis-formula.md"

The axis alone looks like a skeleton. The difference is the distance. A skeleton only keeps the shape's topology. The medial axis transform keeps enough to rebuild the shape. Draw a disk of radius D at every axis pixel, and their union is the shape again.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/medial-axis-params.md"

## Implementation

`medial_axis_filter` in `engine/src/pixelnexus_engine/filters/tree_morphology.py` makes the image binary at a luma of 128, as the skeleton filter does. It calls `skimage.morphology.medial_axis` with the distances, and a fixed seed of 0 for the order in which it breaks ties.

## Worked example

--8<-- "examples/medial-axis.md"

The largest distance is half the width: 12 for the rectangle 24 pixels wide, and 25 for the disk of radius 26. The distance runs from a pixel center to the nearest background pixel center. In the L, the largest distance is 7.07, a little more than half its width of 12, where the two arms meet. The disk's axis is a small cross, not a single point, an effect of thinning on the pixel grid.

## Complexity

--8<-- "filters/medial-axis-complexity.md"

## Artifacts and limitations

--8<-- "filters/medial-axis-limits.md"

## Tests

The axis and distances must equal scikit-image's own call, and the largest distance in a 20 pixel wide rectangle must be 10. Each output must show the axis it computed. The representation must have its three stages.

--8<-- "filters/medial-axis-tests.md"

## References

--8<-- "filters/medial-axis-references.md"
