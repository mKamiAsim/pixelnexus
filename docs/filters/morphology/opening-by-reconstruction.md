# Opening by reconstruction

--8<-- "filters/opening-by-reconstruction-facts.md"

## Overview

Opening by reconstruction erodes the image, then reconstructs the erosion by dilation under the image. Bright objects the element does not fit into vanish, and every other bright object comes back with its exact shape. A plain opening would round their corners instead.

<figure markdown="span">
  ![Three panels: noisy bright disks, the plain opening, which removes the white specks, and the opening by reconstruction, which also removes them and keeps the disks exactly.](../../assets/figures/opening-by-reconstruction-light.svg#only-light){ width="480" }
  ![Three panels: noisy bright disks, the plain opening, which removes the white specks, and the opening by reconstruction, which also removes them and keeps the disks exactly.](../../assets/figures/opening-by-reconstruction-dark.svg#only-dark){ width="480" }
  <figcaption>Opening and opening by reconstruction with disk 2. Both remove the white specks, but only the reconstruction keeps the disks exactly as they were.</figcaption>
</figure>

## How it works

1. Erode the image with the structuring element.
2. Reconstruct the erosion by dilation under the image.

## Mathematical foundation

--8<-- "filters/opening-by-reconstruction-formula.md"

The erosion decides which bright objects are large enough: those that keep at least one pixel. Reconstruction then restores those objects completely, because growth under the image follows each object to its outline. The result is an opening, so it is idempotent and never brighter than the image, and it is a connected operator that never moves an edge.

## Kernel or operator

There is no single kernel. The Inspector lists the erosion and the reconstruction, and the element is on the Erosion page.

## Algorithm

--8<-- "filters/opening-by-reconstruction-steps.md"

## Parameters

--8<-- "filters/opening-by-reconstruction-params.md"

## Implementation

The filter extends the image with the border mode for the erosion, cuts the extension off, and then reconstructs. The function `reconstruct` in `web/src/core/filters/morphology/reconstruction.ts` uses the hybrid algorithm of Vincent: a raster scan, an anti-raster scan, and a queue for the pixels that still need to spread. Reconstruction by erosion runs the same code on negated values. It is a global filter. Reconstruction can reach across the whole image, so the filter always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha.

## Worked example

--8<-- "examples/opening-by-reconstruction.md"

## Complexity

--8<-- "filters/opening-by-reconstruction-complexity.md"

## Artifacts and limitations

--8<-- "filters/opening-by-reconstruction-limits.md"

## Tests

The reference erodes with `scipy.ndimage.grey_erosion` on the extended plane and reconstructs with `skimage.morphology.reconstruction`. The cases cover all five border modes.

--8<-- "filters/opening-by-reconstruction-tests.md"

## References

--8<-- "filters/opening-by-reconstruction-references.md"
