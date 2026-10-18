# Geodesic filtering

--8<-- "filters/geodesic-facts.md"

## Overview

Geodesic filtering runs a fixed number of geodesic dilation or erosion steps. The marker, the image moved down by h, grows one pixel per step but never above the image. It shows how reconstruction spreads, and it limits how far a marker may reach.

<figure markdown="span">
  ![Two panels: a horizontal gray ramp, and the result after 20 geodesic steps, which is close to the ramp but stays below it and is flat near the right edge.](../../assets/figures/geodesic-light.svg#only-light){ width="480" }
  ![Two panels: a horizontal gray ramp, and the result after 20 geodesic steps, which is close to the ramp but stays below it and is flat near the right edge.](../../assets/figures/geodesic-dark.svg#only-dark){ width="480" }
  <figcaption>Geodesic dilation of the ramp moved down by 60, under the ramp itself. Each step copies the brighter value of the right neighbor, so 20 steps climb about 43 of the 60 levels. Near the right edge there is nothing brighter to copy.</figcaption>
</figure>

## How it works

1. Move the image down by h for dilation, or up for erosion.
2. Dilate the marker with the 3 x 3 element and take the minimum with the image, or erode and take the maximum.
3. Repeat for the chosen number of steps.

## Mathematical foundation

--8<-- "filters/geodesic-formula.md"

Each geodesic step spreads the marker by one pixel, along paths that stay under the image. After n steps every pixel holds the largest marker value within n steps along such paths. With enough steps the result stops changing and equals the reconstruction.

## Kernel or operator

There is no kernel. The Inspector lists the marker and the step with the current h, number of steps and connectivity.

## Algorithm

--8<-- "filters/geodesic-steps.md"

## Parameters

--8<-- "filters/geodesic-params.md"

## Implementation

`geodesic` in `web/src/core/filters/morphology/reconstruction.ts` repeats the dilation and the minimum. Pixels past the image edge repeat the edge, which leaves the maximum or minimum unchanged. It is a global filter. Reconstruction can reach across the whole image, so the filter always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha.

## Worked example

--8<-- "examples/geodesic.md"

## Complexity

--8<-- "filters/geodesic-complexity.md"

## Artifacts and limitations

--8<-- "filters/geodesic-limits.md"

## Tests

The reference repeats `scipy.ndimage.grey_dilation` or `grey_erosion` with the 3 x 3 cross or square and takes the minimum or maximum with the image. The cases cover both methods and both connectivities.

--8<-- "filters/geodesic-tests.md"

## References

--8<-- "filters/geodesic-references.md"
