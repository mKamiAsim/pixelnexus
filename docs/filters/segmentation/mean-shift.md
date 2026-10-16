# Mean shift

--8<-- "filters/mean-shift-facts.md"

## Overview

Mean shift treats each pixel as a point in position and color, and moves it to the nearest peak of the density of its neighbors. Pixels in one object climb to the same peak and take nearly the same color, so areas flatten and edges stay sharp. Comaniciu and Meer made it a standard tool for filtering and segmentation. The filtered image can be shown as it is. The regions go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make that region the selection, or select all regions at once. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels. The input has colored squares of 20 pixels and red disks, with grainy noise. The regions mostly follow the squares and the disks, with a few small rectangles of their own color inside some squares. The boundaries panel draws yellow lines along the squares, around the disks and around the small rectangles. The mean colors panel looks like a clean copy of the input.](../../assets/figures/mean-shift-light.svg#only-light){ width="480" }
  ![Four panels. The input has colored squares of 20 pixels and red disks, with grainy noise. The regions mostly follow the squares and the disks, with a few small rectangles of their own color inside some squares. The boundaries panel draws yellow lines along the squares, around the disks and around the small rectangles. The mean colors panel looks like a clean copy of the input.](../../assets/figures/mean-shift-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with colored squares and red disks, with noise of sigma 6. Then the regions of mean shift with the defaults in their label colors, the boundaries in yellow over the image, and each region filled with its mean color.</figcaption>
</figure>

## How it works

--8<-- "filters/mean-shift-steps.md"

## Mathematical foundation

--8<-- "filters/mean-shift-formula.md"

The mean of the points in a window always points toward where the points are denser. Moving to it again and again climbs the density to a peak, a mode. Comaniciu and Meer showed that this climb converges, and that with a flat window the step goes to the mean of the window.

The window is a box in position and a ball in color. A pixel across an edge differs in color by more than the color radius, so it does not pull the mean across the edge. That is why mean shift smooths areas and keeps edges, like a bilateral filter that keeps going until it settles.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/mean-shift-params.md"

## Implementation

`mean_shift` in `engine/src/pixelnexus_engine/filters/segmentation.py` calls `cv2.pyrMeanShiftFiltering` on the 8-bit RGB image with the spatial and color radii. OpenCV stops each pixel after 5 steps or when it moves less than 1, and gives it the color where it stopped. With pyramid levels above 0, OpenCV first works on smaller copies of the image and refines from the smallest.

The filtered colors are not exactly equal inside a region, so the regions are the 4-connected parts in which neighbors differ by at most the color tolerance in each channel. This grouping is our choice. A tolerance of 0 joins equal colors only.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/mean-shift.md"

With no tolerance, even the default radii give 564 regions, since the filtered colors still differ by a level here and there. A tolerance of 2 brings that down to 185, and 6 to 164. That is still more than the 64 squares, because the noise leaves small patches of their own color inside some squares.

## Complexity

--8<-- "filters/mean-shift-complexity.md"

## Artifacts and limitations

--8<-- "filters/mean-shift-limits.md"

## Tests

The filtered colors must equal OpenCV's pyrMeanShiftFiltering, and the filtered output must show them. Grouping must join only equal colors with a tolerance of 0, and colors within the tolerance otherwise. The representation must have its three stages.

--8<-- "filters/mean-shift-tests.md"

## References

--8<-- "filters/mean-shift-references.md"
