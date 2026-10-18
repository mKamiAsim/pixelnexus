# Dilation

--8<-- "filters/dilation-facts.md"

## Overview

Dilation takes the largest value under the structuring element, turned by 180 degrees, at every pixel. Bright objects grow, dark details smaller than the element fill in, and bright points become copies of the element.

<figure markdown="span">
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of dilation with disk 2: larger disks and no black specks, but larger white specks.](../../assets/figures/dilation-light.svg#only-light){ width="480" }
  ![Two panels: bright disks with white and black specks of salt-and-pepper noise, and the result of dilation with disk 2: larger disks and no black specks, but larger white specks.](../../assets/figures/dilation-dark.svg#only-dark){ width="480" }
  <figcaption>Dilation with disk 2 on disks with salt-and-pepper noise. Bright disks grow, the black specks vanish, and the white specks grow.</figcaption>
</figure>

## How it works

1. Turn the element by 180 degrees.
2. Place it on a pixel and look at the values it covers.
3. Keep the largest one. Repeat for each iteration.

## Mathematical foundation

--8<-- "filters/dilation-formula.md"

The structuring element B is a small set of offsets around the anchor, its center. The editor offers a disk, rectangle, ellipse, cross, diamond, line with angle and length, and a custom grid of 0 and 1. A flat element only selects pixels, it has no weights. Dilation is the dual of erosion: dilating the image is the same as eroding its negative with the turned element. The turn makes dilation of a single bright pixel produce the element itself. For symmetric elements, such as a disk, the turn changes nothing.

## Kernel or operator

The Inspector shows the structuring element as a grid, with the anchor outlined, and the formula. The Morphology stepper shows the values under the element at the probe.

## Algorithm

--8<-- "filters/dilation-steps.md"

## Parameters

--8<-- "filters/dilation-params.md"

## Implementation

`morphology` in `web/src/core/filters/morphology/gray.ts` builds every filter from `erodePlane` and `dilatePlane`, which take the smallest or the largest value under the element. The element comes from `parseStructuringElement` in `web/src/core/filters/morphology/structuring.ts`. The filter extends the plane once by its full reach with the border mode, runs its steps and cuts the extension off, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope and alpha.

## Worked example

--8<-- "examples/dilation.md"

## Complexity

--8<-- "filters/dilation-complexity.md"

## Artifacts and limitations

--8<-- "filters/dilation-limits.md"

## Tests

The reference runs `scipy.ndimage.grey_erosion` and `scipy.ndimage.grey_dilation` on the extended plane. Before the cases are written, the script checks that single steps equal SciPy with the border mode applied directly. It does so for a disk, a line and an element that is not symmetric. It also checks that the disk, diamond and ellipse elements equal those of `skimage.morphology`. The cases cover three elements, one and two iterations, and all five border modes.

--8<-- "filters/dilation-tests.md"

## References

--8<-- "filters/dilation-references.md"
