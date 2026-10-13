# Opening

--8<-- "filters/opening-facts.md"

## Overview

Opening is an erosion followed by a dilation with the same element. It removes bright details the element does not fit into and keeps the larger bright objects at their size.

<figure markdown="span">
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of opening with disk 2: the white specks are gone and the disks keep their size.](../../assets/figures/opening-light.svg#only-light){ width="480" }
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of opening with disk 2: the white specks are gone and the disks keep their size.](../../assets/figures/opening-dark.svg#only-dark){ width="480" }
  <figcaption>Opening with disk 2 on disks with salt-and-pepper noise. The white specks vanish and the disks keep their size. The black specks stay.</figcaption>
</figure>

## How it works

1. Erode with the element, once per iteration.
2. Dilate with the same element, once per iteration.
3. What the element fits into survives.

## Mathematical foundation

--8<-- "filters/opening-formula.md"

The structuring element B is a small set of offsets around the anchor, its center. The editor offers a disk, rectangle, ellipse, cross, diamond, line with angle and length, and a custom grid of 0 and 1. A flat element only selects pixels, it has no weights. The opening is the union of all placements of the element that fit under the image. It never makes the image brighter, it keeps the order of images, and opening twice changes nothing more.

## Kernel or operator

The Inspector shows the structuring element as a grid, with the anchor outlined, and the formula. The Morphology stepper shows the values under the element at the probe.

## Algorithm

--8<-- "filters/opening-steps.md"

## Parameters

--8<-- "filters/opening-params.md"

## Implementation

`morphology` in `web/src/core/filters/morphology/gray.ts` builds every filter from `erodePlane` and `dilatePlane`, which take the smallest or the largest value under the element. The element comes from `parseStructuringElement` in `web/src/core/filters/morphology/structuring.ts`. The filter extends the plane once by its full reach with the border mode, runs its steps and cuts the extension off, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope and alpha.

## Worked example

--8<-- "examples/opening.md"

## Complexity

--8<-- "filters/opening-complexity.md"

## Artifacts and limitations

--8<-- "filters/opening-limits.md"

## Tests

The reference runs `scipy.ndimage.grey_erosion` and `scipy.ndimage.grey_dilation` on the extended plane. Before the cases are written, the script checks that single steps equal SciPy with the border mode applied directly. It does so for a disk, a line and an element that is not symmetric. It also checks that the disk, diamond and ellipse elements equal those of `skimage.morphology`. The cases cover three elements, one and two iterations, and all five border modes.

--8<-- "filters/opening-tests.md"

## References

--8<-- "filters/opening-references.md"
