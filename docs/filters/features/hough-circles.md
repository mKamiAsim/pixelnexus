# Hough transform for circles

--8<-- "filters/hough-circles-facts.md"

## Overview

The circle Hough transform finds circles by voting, like the Hough transform for lines. First Canny finds the edge pixels. Then every edge pixel votes for the centers of all circles through it, one radius at a time. Centers where many votes meet are the circles. The circles go to the Features panel and are drawn on the canvas. The filter can also show the accumulator. It runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. On the Disks image, a thin ring lies on the edge of each of the six disks. The accumulator shows a bright point at the center of each disk, inside rings and spokes of fainter votes. A band hides the tops of the two lower disks. With the threshold 0.3 both are still found, and small rings sit where the band meets them. With noise, the six disks are found and a few small rings appear in the background.](../../assets/figures/hough-circles-light.svg#only-light){ width="480" }
  ![Four panels. On the Disks image, a thin ring lies on the edge of each of the six disks. The accumulator shows a bright point at the center of each disk, inside rings and spokes of fainter votes. A band hides the tops of the two lower disks. With the threshold 0.3 both are still found, and small rings sit where the band meets them. With noise, the six disks are found and a few small rings appear in the background.](../../assets/figures/hough-circles-dark.svg#only-dark){ width="480" }
  <figcaption>The Disks test image with the circles found for radii from 3 to 40, each drawn as a ring. Then the accumulator, and the circles with a share threshold of 0.3 when a band hides the tops of the two lower disks. Last, the circles with noise of sigma 12.</figcaption>
</figure>

## How it works

--8<-- "filters/hough-circles-steps.md"

## Mathematical foundation

--8<-- "filters/hough-circles-formula.md"

For a fixed radius r, the centers of all circles through an edge pixel lie on a circle of radius r around that pixel. Each edge pixel draws this circle of votes. For a real circle of radius r in the image, all its edge pixels draw circles that pass through its center, so the votes pile up there.

A large circle has more edge pixels than a small one, so its raw count is higher. Dividing by the number of points on the circle gives the share of the circle that lies on edges. A full, clean circle reaches about 0.6 here, since Canny edges and the drawn circle do not match pixel for pixel. A circle that is partly hidden reaches less, so the share threshold decides how much of a circle must be visible.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings: the Canny edges, the voting with the range of radii, and the peak search.

## Parameters

--8<-- "filters/hough-circles-params.md"

## Implementation

`hough_circles` in `engine/src/pixelnexus_engine/filters/hough.py` finds edges with `skimage.feature.canny` on the luma from 0 to 1. Then `skimage.transform.hough_circle` builds one accumulator for each radius, normalized by the number of points on the circle. Next, `hough_circle_peaks` finds the peaks of each radius that reach the threshold. With a distance apart above 1, it also drops a circle whose center lies within that distance in both x and y of a stronger circle, of any radius. The table gives the center, the radius and the share, strongest first. The accumulator view is the largest share over all radii at each center, stretched.

## Worked example

--8<-- "examples/hough-circles.md"

On the clean image, every disk is found with its radius and nothing else. A band that hides about a third of the circles of the two lower disks drops their share below 0.5, so they are lost. A threshold of 0.3 finds them again, along with 4 small circles at the corners where the band meets the disks. Noise of sigma 12 keeps all six disks and adds 4 small circles elsewhere.

## Complexity

--8<-- "filters/hough-circles-complexity.md"

## Artifacts and limitations

--8<-- "filters/hough-circles-limits.md"

## Tests

The six disks of the Disks image must each be found once, at their center and with their radius within 1 pixel. Each share must be the value of scikit-image's normalized accumulator at that center and radius, and at least the threshold. The table must have the columns x, y, radius and share, and the accumulator view must be the largest share over the radii, stretched. The engine API test checks the JSON table.

--8<-- "filters/hough-circles-tests.md"

## References

--8<-- "filters/hough-circles-references.md"
