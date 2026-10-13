# Black-hat

--8<-- "filters/blackhat-facts.md"

## Overview

The black-hat, or bottom-hat, is the closing minus the image. The closing fills every dark detail the element does not fit into, so the black-hat keeps those dark details, shown as bright values.

<figure markdown="span">
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of the black-hat with disk 3: only the black specks remain, now bright.](../../assets/figures/blackhat-light.svg#only-light){ width="480" }
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of the black-hat with disk 3: only the black specks remain, now bright.](../../assets/figures/blackhat-dark.svg#only-dark){ width="480" }
  <figcaption>The black-hat with disk 3. Only the dark details smaller than the element remain, now bright: the black specks.</figcaption>
</figure>

## How it works

1. Close the image with the element.
2. Subtract the image from the closing.
3. Only the small dark details remain, as bright values.

## Mathematical foundation

--8<-- "filters/blackhat-formula.md"

The structuring element B is a small set of offsets around the anchor, its center. The editor offers a disk, rectangle, ellipse, cross, diamond, line with angle and length, and a custom grid of 0 and 1. A flat element only selects pixels, it has no weights. The black-hat is the dual of the top-hat. It suits dark text or scratches on a lighter, uneven background.

## Kernel or operator

The Inspector shows the structuring element as a grid, with the anchor outlined, and the formula. The Morphology stepper shows the values under the element at the probe.

## Algorithm

--8<-- "filters/blackhat-steps.md"

## Parameters

--8<-- "filters/blackhat-params.md"

## Implementation

`morphology` in `web/src/core/filters/morphology/gray.ts` builds every filter from `erodePlane` and `dilatePlane`, which take the smallest or the largest value under the element. The element comes from `parseStructuringElement` in `web/src/core/filters/morphology/structuring.ts`. The filter extends the plane once by its full reach with the border mode, runs its steps and cuts the extension off, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope and alpha.

## Worked example

--8<-- "examples/blackhat.md"

## Complexity

--8<-- "filters/blackhat-complexity.md"

## Artifacts and limitations

--8<-- "filters/blackhat-limits.md"

## Tests

The reference runs `scipy.ndimage.grey_erosion` and `scipy.ndimage.grey_dilation` on the extended plane. Before the cases are written, the script checks that single steps equal SciPy with the border mode applied directly. It does so for a disk, a line and an element that is not symmetric. It also checks that the disk, diamond and ellipse elements equal those of `skimage.morphology`. The cases cover three elements, one and two iterations, and all five border modes.

--8<-- "filters/blackhat-tests.md"

## References

--8<-- "filters/blackhat-references.md"
