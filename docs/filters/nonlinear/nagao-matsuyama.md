# Nagao-Matsuyama filter

--8<-- "filters/nagao-matsuyama-facts.md"

## Overview

The Nagao-Matsuyama filter is a cousin of the Kuwahara filter with nine subregions in a 5x5 window instead of four quadrants. Eight of them point outward, to the four sides and the four corners, so a region fits on one side of an edge in any of eight directions. The filter writes the mean of the calmest region. It keeps edges and corners and is less blocky than the Kuwahara filter.

<figure markdown="span">
  ![Three panels: disks with Gaussian noise, the result of one pass of the Nagao-Matsuyama filter, and the result of three passes with smoother flat areas and round disk edges.](../../assets/figures/nagao-matsuyama-light.svg#only-light){ width="480" }
  ![Three panels: disks with Gaussian noise, the result of one pass of the Nagao-Matsuyama filter, and the result of three passes with smoother flat areas and round disk edges.](../../assets/figures/nagao-matsuyama-dark.svg#only-dark){ width="480" }
  <figcaption>One pass smooths a little. Three passes smooth more, and the small disks keep their round shape.</figcaption>
</figure>

## How it works

1. Look at nine shapes in the 5x5 window: the center 3x3 square, four pentagons that point to the sides and four hexagons that point to the corners.
2. Measure the mean and the variance of each shape.
3. Write the mean of the shape with the smallest variance.

## Mathematical foundation

--8<-- "filters/nagao-matsuyama-formula.md"

Each pentagon and hexagon holds 7 pixels, including the center pixel. A pentagon covers two rows or columns on one side of the center. A hexagon covers a corner of the window. These shapes avoid the pixels on the other side of an edge in eight directions. That is why the filter keeps diagonal edges and corners better than the four Kuwahara quadrants. The window is small, so stronger smoothing comes from repeating the filter.

## Kernel or operator

There is no kernel. The Inspector shows the window and the rule. The worked example below lists all nine regions for one pixel on a diagonal edge.

## Algorithm

--8<-- "filters/nagao-matsuyama-steps.md"

## Parameters

--8<-- "filters/nagao-matsuyama-params.md"

## Implementation

`nagaoMatsuyamaFilter` in `web/src/core/filters/nonlinear/subregions.ts` builds the nine regions in `nagaoRegions`, by turning one pentagon and one hexagon through four quarter turns. It shares the selection code with the Kuwahara filter. It is a color filter: the framework in `web/src/core/filters/run.ts` hands it the red, green and blue planes together, with the border mode, and keeps alpha. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/nagao-matsuyama.md"

## Complexity

--8<-- "filters/nagao-matsuyama-complexity.md"

## Artifacts and limitations

--8<-- "filters/nagao-matsuyama-limits.md"

## Tests

The reference builds the same nine regions with NumPy and checks that they are all different, with 9 and 7 pixels. The test compares the filter on a color input for all five border modes.

--8<-- "filters/nagao-matsuyama-tests.md"

## References

--8<-- "filters/nagao-matsuyama-references.md"
