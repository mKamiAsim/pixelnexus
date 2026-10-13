# Erosion

--8<-- "filters/erosion-facts.md"

## Overview

Erosion takes the smallest value under the structuring element at every pixel. Bright objects shrink, bright details smaller than the element vanish, and dark areas grow. It is the basic step of mathematical morphology, together with dilation.

<figure markdown="span">
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of erosion with disk 2: smaller disks and no white specks, but larger black specks.](../../assets/figures/erosion-light.svg#only-light){ width="480" }
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of erosion with disk 2: smaller disks and no white specks, but larger black specks.](../../assets/figures/erosion-dark.svg#only-dark){ width="480" }
  <figcaption>Erosion with disk 2 on disks with salt-and-pepper noise. Bright disks shrink, the white specks vanish, and the black specks grow.</figcaption>
</figure>

## How it works

1. Place the element on a pixel.
2. Look at the values it covers.
3. Keep the smallest one. Repeat for each iteration.

## Mathematical foundation

--8<-- "filters/erosion-formula.md"

The structuring element B is a small set of offsets around the anchor, its center. The editor offers a disk, rectangle, ellipse, cross, diamond, line with angle and length, and a custom grid of 0 and 1. A flat element only selects pixels, it has no weights. Erosion asks, at each pixel, how bright the image is everywhere under the element, and takes the smallest value. On a binary image it keeps a pixel only if the element fits entirely inside the object there.

## Kernel or operator

The Inspector shows the structuring element as a grid, with the anchor outlined, and the formula. The Morphology stepper shows the values under the element at the probe.

## Algorithm

--8<-- "filters/erosion-steps.md"

## Parameters

--8<-- "filters/erosion-params.md"

## Implementation

`morphology` in `web/src/core/filters/morphology/gray.ts` builds every filter from `erodePlane` and `dilatePlane`, which take the smallest or the largest value under the element. The element comes from `parseStructuringElement` in `web/src/core/filters/morphology/structuring.ts`. The filter extends the plane once by its full reach with the border mode, runs its steps and cuts the extension off, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope and alpha.

## Worked example

--8<-- "examples/erosion.md"

## Complexity

--8<-- "filters/erosion-complexity.md"

## Artifacts and limitations

--8<-- "filters/erosion-limits.md"

## Tests

The reference runs `scipy.ndimage.grey_erosion` and `scipy.ndimage.grey_dilation` on the extended plane. Before the cases are written, the script checks that single steps equal SciPy with the border mode applied directly. It does so for a disk, a line and an element that is not symmetric. It also checks that the disk, diamond and ellipse elements equal those of `skimage.morphology`. The cases cover three elements, one and two iterations, and all five border modes.

--8<-- "filters/erosion-tests.md"

## References

--8<-- "filters/erosion-references.md"
