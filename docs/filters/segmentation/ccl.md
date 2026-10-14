# Connected-component labeling

--8<-- "filters/ccl-facts.md"

## Overview

Connected-component labeling turns a black and white mask into separate objects. Every group of white pixels that hang together gets its own number, so the objects can be counted and measured one by one. The result shows each component in its own color.

<figure markdown="span">
  ![Two panels: white disks of several sizes and four single dots on black, and the same shapes, each in a different color.](../../assets/figures/ccl-light.svg#only-light){ width="480" }
  ![Two panels: white disks of several sizes and four single dots on black, and the same shapes, each in a different color.](../../assets/figures/ccl-dark.svg#only-dark){ width="480" }
  <figcaption>The test disks and their components, each in its own color.</figcaption>
</figure>

## How it works

1. Mark the bright pixels as foreground.
2. Scan the image row by row. At each foreground pixel that has no label yet, start a new label.
3. Give that label to every foreground pixel connected to it.

## Mathematical foundation

--8<-- "filters/ccl-formula.md"

Connectivity decides what touching means. With 4 neighbors, a pixel touches the pixels left, right, above and below it. With 8 neighbors, the four corners count too. A diagonal line one pixel wide is one component with 8 neighbors, and a row of single pixels with 4.

## Kernel or operator

The Inspector shows the foreground rule and the labeling with the current settings.

## Algorithm

--8<-- "filters/ccl-steps.md"

## Parameters

--8<-- "filters/ccl-params.md"

## Implementation

`cclLabelFilter` in `web/src/core/filters/segmentation/regions.ts` uses `labelComponents`, the code that connected-component filtering also uses.

## Worked example

--8<-- "examples/ccl.md"

## Complexity

--8<-- "filters/ccl-complexity.md"

## Artifacts and limitations

--8<-- "filters/ccl-limits.md"

## Tests

The fixture cases compare every pixel with scipy.ndimage.label on the color test image, with 4 and 8 neighbors, with Invert, and in both views. Unit tests check that corners join pixels only with 8 neighbors, the numbering order, and the colors.

--8<-- "filters/ccl-tests.md"

## References

--8<-- "filters/ccl-references.md"
