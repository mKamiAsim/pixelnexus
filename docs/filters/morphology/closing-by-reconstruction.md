# Closing by reconstruction

--8<-- "filters/closing-by-reconstruction-facts.md"

## Overview

Closing by reconstruction dilates the image, then reconstructs the dilation by erosion over the image. Dark objects the element does not fit into fill in, and every other dark object comes back with its exact shape.

<figure markdown="span">
  ![Three panels: noisy bright disks, the plain closing, which fills the black specks, and the closing by reconstruction, which also fills them.](../../assets/figures/closing-by-reconstruction-light.svg#only-light){ width="480" }
  ![Three panels: noisy bright disks, the plain closing, which fills the black specks, and the closing by reconstruction, which also fills them.](../../assets/figures/closing-by-reconstruction-dark.svg#only-dark){ width="480" }
  <figcaption>Closing and closing by reconstruction with disk 2. Both fill the black specks in the background, and the reconstruction keeps the dark background exact.</figcaption>
</figure>

## How it works

1. Dilate the image with the structuring element.
2. Reconstruct the dilation by erosion over the image.

## Mathematical foundation

--8<-- "filters/closing-by-reconstruction-formula.md"

The dilation decides which dark objects are large enough: those that keep at least one pixel. Reconstruction by erosion then restores those dark objects completely. The result is a closing, and a connected operator that never moves an edge.

## Kernel or operator

There is no single kernel. The Inspector lists the dilation and the reconstruction, and the element is on the Dilation page.

## Algorithm

--8<-- "filters/closing-by-reconstruction-steps.md"

## Parameters

--8<-- "filters/closing-by-reconstruction-params.md"

## Implementation

The filter extends the image with the border mode for the dilation, cuts the extension off, and then reconstructs. The function `reconstruct` in `web/src/core/filters/morphology/reconstruction.ts` uses the hybrid algorithm of Vincent: a raster scan, an anti-raster scan, and a queue for the pixels that still need to spread. Reconstruction by erosion runs the same code on negated values. It is a global filter. Reconstruction can reach across the whole image, so the filter always runs on the whole image in one tile, and a selection is cut out of the result. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha.

## Worked example

--8<-- "examples/closing-by-reconstruction.md"

## Complexity

--8<-- "filters/closing-by-reconstruction-complexity.md"

## Artifacts and limitations

--8<-- "filters/closing-by-reconstruction-limits.md"

## Tests

The reference dilates with `scipy.ndimage.grey_dilation` on the extended plane and reconstructs with `skimage.morphology.reconstruction`. The cases cover all five border modes.

--8<-- "filters/closing-by-reconstruction-tests.md"

## References

--8<-- "filters/closing-by-reconstruction-references.md"
