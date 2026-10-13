# Morphological reconstruction

--8<-- "filters/reconstruction-facts.md"

## Overview

Morphological reconstruction lets a marker grow under the image until nothing changes. Every bright region the marker touches comes back, up to the marker's height, and keeps its exact outline. Here the marker is the image moved down by h, so every peak loses its top h levels and smaller peaks vanish. Reconstruction by erosion does the same for dark valleys.

<figure markdown="span">
  ![Two panels: noisy bright disks, and the reconstruction with h 60, in which the disks and white specks are dimmer and the dark background is unchanged.](../../assets/figures/reconstruction-light.svg#only-light){ width="480" }
  ![Two panels: noisy bright disks, and the reconstruction with h 60, in which the disks and white specks are dimmer and the dark background is unchanged.](../../assets/figures/reconstruction-dark.svg#only-dark){ width="480" }
  <figcaption>Reconstruction by dilation with h = 60 on noisy disks. Every bright peak loses its top 60 levels, so the disks and the white specks are dimmer. The dark background stays as it was.</figcaption>
</figure>

## How it works

1. Move the image down by h to get the marker.
2. Let the marker grow, one neighbor at a time, but never above the image.
3. Stop when nothing changes.

## Mathematical foundation

--8<-- "filters/reconstruction-formula.md"

A geodesic dilation dilates the marker with the 3 x 3 element and takes the minimum with the image, the mask. Repeating it until nothing changes gives the reconstruction. Because growth follows connected paths, a region is either restored or not, and its borders never move. With the marker f - h, the result removes the h-domes, the top h levels of every peak, and subtracting it from the image gives those domes.

## Kernel or operator

There is no kernel. The Inspector lists the marker and the reconstruction with the current h and connectivity.

## Algorithm

--8<-- "filters/reconstruction-steps.md"

## Parameters

--8<-- "filters/reconstruction-params.md"

## Implementation

The function `reconstruct` in `web/src/core/filters/morphology/reconstruction.ts` uses the hybrid algorithm of Vincent: a raster scan, an anti-raster scan, and a queue for the pixels that still need to spread. Reconstruction by erosion runs the same code on negated values. It is a global filter. Reconstruction can reach across the whole image, so the filter always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha.

## Worked example

--8<-- "examples/reconstruction.md"

## Complexity

--8<-- "filters/reconstruction-complexity.md"

## Artifacts and limitations

--8<-- "filters/reconstruction-limits.md"

## Tests

The reference uses `skimage.morphology.reconstruction` with the 3 x 3 cross or square. Before the cases are written, the script checks that plain iterated geodesic dilation gives the same result as scikit-image. The cases cover both methods and both connectivities.

--8<-- "filters/reconstruction-tests.md"

## References

--8<-- "filters/reconstruction-references.md"
