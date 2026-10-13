# Morphological gradient

--8<-- "filters/morph-gradient-facts.md"

## Overview

The morphological gradient, also called the Beucher gradient, is the dilation minus the erosion. It is 0 in flat areas and large across edges, with a thickness set by the element.

<figure markdown="span">
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of the morphological gradient with disk 1: bright edges two pixels thick, and small rings around the specks.](../../assets/figures/morph-gradient-light.svg#only-light){ width="480" }
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of the morphological gradient with disk 1: bright edges two pixels thick, and small rings around the specks.](../../assets/figures/morph-gradient-dark.svg#only-dark){ width="480" }
  <figcaption>The morphological gradient with disk 1 on the same image. Edges are bright and two pixels thick, and every speck becomes a small ring.</figcaption>
</figure>

## How it works

1. Dilate the image with the element.
2. Erode the image with the element.
3. Subtract the erosion from the dilation.

## Mathematical foundation

--8<-- "filters/morph-gradient-formula.md"

The structuring element B is a small set of offsets around the anchor, its center. The editor offers a disk, rectangle, ellipse, cross, diamond, line with angle and length, and a custom grid of 0 and 1. A flat element only selects pixels, it has no weights. For a flat element the gradient is the range of the values under the element, the largest minus the smallest. It is the sum of the internal and the external gradient.

## Kernel or operator

The Inspector shows the structuring element as a grid, with the anchor outlined, and the formula. The Morphology stepper shows the values under the element at the probe.

## Algorithm

--8<-- "filters/morph-gradient-steps.md"

## Parameters

--8<-- "filters/morph-gradient-params.md"

## Implementation

`morphology` in `web/src/core/filters/morphology/gray.ts` builds every filter from `erodePlane` and `dilatePlane`, which take the smallest or the largest value under the element. The element comes from `parseStructuringElement` in `web/src/core/filters/morphology/structuring.ts`. The filter extends the plane once by its full reach with the border mode, runs its steps and cuts the extension off, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope and alpha.

## Worked example

--8<-- "examples/morph-gradient.md"

## Complexity

--8<-- "filters/morph-gradient-complexity.md"

## Artifacts and limitations

--8<-- "filters/morph-gradient-limits.md"

## Tests

The reference runs `scipy.ndimage.grey_erosion` and `scipy.ndimage.grey_dilation` on the extended plane. Before the cases are written, the script checks that single steps equal SciPy with the border mode applied directly. It does so for a disk, a line and an element that is not symmetric. It also checks that the disk, diamond and ellipse elements equal those of `skimage.morphology`. The cases cover three elements, one and two iterations, and all five border modes.

--8<-- "filters/morph-gradient-tests.md"

## References

--8<-- "filters/morph-gradient-references.md"
