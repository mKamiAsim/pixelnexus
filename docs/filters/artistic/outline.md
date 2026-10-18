# Outline

--8<-- "filters/outline-facts.md"

## Overview

Outline turns an image into dark lines on white. It is Pillow's CONTOUR filter: a Laplacian plus 255, so flat areas are white and the darker side of each edge gets a dark line.

<figure markdown="span">
  ![Two panels: white disks on a dark background, and the outlined disks, thin dark rings on a white background.](../../assets/figures/outline-light.svg#only-light){ width="480" }
  ![Two panels: white disks on a dark background, and the outlined disks, thin dark rings on a white background.](../../assets/figures/outline-dark.svg#only-dark){ width="480" }
  <figcaption>The test disks, and outline with the default settings.</figcaption>
</figure>

## How it works

1. Multiply each pixel by 8 and subtract its 8 neighbors.
2. Add 255, so that flat areas become white.
3. Clip the result to 0 to 255.

## Mathematical foundation

--8<-- "filters/outline-formula.md"

At a step from dark to bright, the pixel on the dark side is darker than the mean of its neighbors, so its sum is negative and it turns dark. The pixel on the bright side has a positive sum, which the offset pushes past 255, so it stays white. That is why the line is one pixel wide and lies on the dark side.

## Kernel or operator

The Inspector shows the 3 x 3 kernel and the offset of 255.

## Algorithm

--8<-- "filters/outline-steps.md"

## Parameters

--8<-- "filters/outline-params.md"

## Implementation

`outlineFilter` in `web/src/core/filters/artistic/kernels.ts` correlates the image with `CONTOUR_ROWS` and adds 255.

## Worked example

--8<-- "examples/outline.md"

## Complexity

--8<-- "filters/outline-complexity.md"

## Artifacts and limitations

--8<-- "filters/outline-limits.md"

## Tests

The fixture cases compare every pixel with scipy.ndimage.correlate and the same kernel, for three border modes. Before the cases are written, the result is checked against Pillow's CONTOUR away from the edge.

--8<-- "filters/outline-tests.md"

## References

--8<-- "filters/outline-references.md"
