# Top-hat

--8<-- "filters/tophat-facts.md"

## Overview

The top-hat, or white top-hat, is the image minus its opening. The opening keeps everything the element fits into, so the top-hat keeps only the bright details that are smaller than the element. It also removes a slowly changing background.

<figure markdown="span">
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of the top-hat with disk 3: only the white specks and the smallest dot remain.](../../assets/figures/tophat-light.svg#only-light){ width="480" }
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of the top-hat with disk 3: only the white specks and the smallest dot remain.](../../assets/figures/tophat-dark.svg#only-dark){ width="480" }
  <figcaption>The top-hat with disk 3. Only the bright details smaller than the element remain: the white specks and the smallest dots.</figcaption>
</figure>

## How it works

1. Open the image with the element.
2. Subtract the opening from the image.
3. Only the small bright details remain.

## Mathematical foundation

--8<-- "filters/tophat-formula.md"

The structuring element B is a small set of offsets around the anchor, its center. The editor offers a disk, rectangle, ellipse, cross, diamond, line with angle and length, and a custom grid of 0 and 1. A flat element only selects pixels, it has no weights. Choose an element larger than the details you want and smaller than the background changes. Then the opening follows the background, and the top-hat holds the details on a flat, dark background, ready for a threshold.

## Kernel or operator

The Inspector shows the structuring element as a grid, with the anchor outlined, and the formula. The Morphology stepper shows the values under the element at the probe.

## Algorithm

--8<-- "filters/tophat-steps.md"

## Parameters

--8<-- "filters/tophat-params.md"

## Implementation

`morphology` in `web/src/core/filters/morphology/gray.ts` builds every filter from `erodePlane` and `dilatePlane`, which take the smallest or the largest value under the element. The element comes from `parseStructuringElement` in `web/src/core/filters/morphology/structuring.ts`. The filter extends the plane once by its full reach with the border mode, runs its steps and cuts the extension off, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope and alpha.

## Worked example

--8<-- "examples/tophat.md"

## Complexity

--8<-- "filters/tophat-complexity.md"

## Artifacts and limitations

--8<-- "filters/tophat-limits.md"

## Tests

The reference runs `scipy.ndimage.grey_erosion` and `scipy.ndimage.grey_dilation` on the extended plane. Before the cases are written, the script checks that single steps equal SciPy with the border mode applied directly. It does so for a disk, a line and an element that is not symmetric. It also checks that the disk, diamond and ellipse elements equal those of `skimage.morphology`. The cases cover three elements, one and two iterations, and all five border modes.

--8<-- "filters/tophat-tests.md"

## References

--8<-- "filters/tophat-references.md"
