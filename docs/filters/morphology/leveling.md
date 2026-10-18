# Morphological leveling

--8<-- "filters/leveling-facts.md"

## Overview

A leveling moves the image toward a marker, here a Gaussian blur of the image, while keeping every edge exactly in place. Flat zones grow and merge, but no new slope appears and no edge moves. It simplifies an image for segmentation without the blur of the marker.

<figure markdown="span">
  ![Three panels: noisy bright disks, the blurred marker, and the leveling, which is smooth inside and outside the disks with sharp disk edges.](../../assets/figures/leveling-light.svg#only-light){ width="480" }
  ![Three panels: noisy bright disks, the blurred marker, and the leveling, which is smooth inside and outside the disks with sharp disk edges.](../../assets/figures/leveling-dark.svg#only-dark){ width="480" }
  <figcaption>Leveling of noisy disks with a Gaussian marker of sigma 2. The marker is blurred, but the leveling keeps the disk edges sharp while it flattens the noise.</figcaption>
</figure>

## How it works

1. Blur the image to get a marker.
2. Let the marker grow up under bright parts of the image and shrink down over dark parts.
3. Repeat until nothing changes.

## Mathematical foundation

--8<-- "filters/leveling-formula.md"

Meyer defined levelings as images whose changes between neighbors always follow the original image. Where two neighbors differ in the result, they differ in the same direction and at least as much in the image. The leveling of an image with a marker is the limit of repeating (f min dilation of g) max erosion of g. Where the marker lies below the image this is reconstruction by dilation, and where it lies above, reconstruction by erosion.

## Kernel or operator

There is no kernel. The Inspector lists the marker and the leveling step with the current sigma and connectivity.

## Algorithm

--8<-- "filters/leveling-steps.md"

## Parameters

--8<-- "filters/leveling-params.md"

## Implementation

`leveling` in `web/src/core/filters/morphology/reconstruction.ts` repeats the step with the 3 x 3 element until nothing changes, at most 2000 times. Large images can need many steps, so the preview runs only on demand. It is a global filter. Reconstruction can reach across the whole image, so the filter always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha.

## Worked example

--8<-- "examples/leveling.md"

## Complexity

--8<-- "filters/leveling-complexity.md"

## Artifacts and limitations

--8<-- "filters/leveling-limits.md"

## Tests

The reference repeats the same step with `scipy.ndimage`. Before the cases are written, the script checks that a marker below the image gives `skimage.morphology.reconstruction` by dilation and a marker above it gives reconstruction by erosion. The cases cover all five border modes for the marker.

--8<-- "filters/leveling-tests.md"

## References

--8<-- "filters/leveling-references.md"
