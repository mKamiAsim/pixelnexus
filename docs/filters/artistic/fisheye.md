# Fisheye distortion

--8<-- "filters/fisheye-facts.md"

## Overview

The fisheye distortion bends the image as a fisheye lens would. The center grows and the edges are pressed together, while the corners stay in place. It redraws the image as an equidistant fisheye with the same field of view.

<figure markdown="span">
  ![Two panels: a checkerboard, and the checkerboard bulging out from the center, its squares large in the middle and small near the edges.](../../assets/figures/fisheye-light.svg#only-light){ width="480" }
  ![Two panels: a checkerboard, and the checkerboard bulging out from the center, its squares large in the middle and small near the edges.](../../assets/figures/fisheye-dark.svg#only-dark){ width="480" }
  <figcaption>A checkerboard, and the fisheye distortion with a field of view of 150 degrees.</figcaption>
</figure>

## How it works

1. Measure each output pixel's distance from the center.
2. Read the source from closer to the center, by the ratio of the two lens projections.
3. Interpolate the source bilinearly.

## Mathematical foundation

--8<-- "filters/fisheye-formula.md"

A rectilinear lens, the usual kind, keeps straight lines straight: a ray at angle theta lands at a radius proportional to tan theta. An equidistant fisheye lands it at a radius proportional to theta itself. For small angles the two agree, but toward the edge tan theta grows much faster. Redrawing a rectilinear image in the fisheye model therefore enlarges the center relative to the edges.

## Kernel or operator

The Inspector shows the mapping with the current settings, then the bilinear read of the source.

## Algorithm

--8<-- "filters/fisheye-steps.md"

## Parameters

--8<-- "filters/fisheye-params.md"

## Implementation

`fisheyeFilter` in `web/src/core/filters/artistic/distort.ts`. It reads the source with `sampleBilinear` through `warpPlane`. The filter is global, and it sets `movesAlpha`, so the runner moves the alpha plane with the same mapping and transparency stays with its colors.

## Worked example

--8<-- "examples/fisheye.md"

## Complexity

--8<-- "filters/fisheye-complexity.md"

## Artifacts and limitations

--8<-- "filters/fisheye-limits.md"

## Tests

The reference computes the same mapping with NumPy and reads the source with scipy.ndimage.map_coordinates at order 1, an independent bilinear sampler, for several settings and border modes. Unit tests check that the corners stay and that the center reads from closer in.

--8<-- "filters/fisheye-tests.md"

## References

--8<-- "filters/fisheye-references.md"
