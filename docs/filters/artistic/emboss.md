# Emboss

--8<-- "filters/emboss-facts.md"

## Overview

Emboss makes an image look like a relief pressed into metal or stone. Each pixel is compared with one diagonal neighbor, and mid gray is added, so flat areas turn gray and edges turn light or dark depending on which way they face.

<figure markdown="span">
  ![Two panels: white disks on a dark background, and the embossed disks, gray with a light rim on one side and a dark rim on the other.](../../assets/figures/emboss-light.svg#only-light){ width="480" }
  ![Two panels: white disks on a dark background, and the embossed disks, gray with a light rim on one side and a dark rim on the other.](../../assets/figures/emboss-dark.svg#only-dark){ width="480" }
  <figcaption>The test disks, and emboss with the default settings.</figcaption>
</figure>

## How it works

1. Subtract the pixel below and to the left from each pixel.
2. Add 128, so that flat areas become mid gray.
3. Clip the result to 0 to 255.

## Mathematical foundation

--8<-- "filters/emboss-formula.md"

The difference along one diagonal is a directional derivative. It is 0 where the image does not change in that direction, so edges that run along the diagonal leave no trace. Pillow's kernel is printed with -1 at the top left. A test with one bright pixel shows that Pillow applies the first kernel row to the row below, so PixelNexus stores the kernel the way Pillow really applies it.

## Kernel or operator

The Inspector shows the 3 x 3 kernel, as a correlation, and the offset of 128.

## Algorithm

--8<-- "filters/emboss-steps.md"

## Parameters

--8<-- "filters/emboss-params.md"

## Implementation

`embossFilter` in `web/src/core/filters/artistic/kernels.ts` correlates the image with `EMBOSS_ROWS` and adds 128.

## Worked example

--8<-- "examples/emboss.md"

## Complexity

--8<-- "filters/emboss-complexity.md"

## Artifacts and limitations

--8<-- "filters/emboss-limits.md"

## Tests

The fixture cases compare every pixel with scipy.ndimage.correlate and the same kernel, for three border modes. Before the cases are written, the result is checked against Pillow's EMBOSS away from the edge, where Pillow rounds to whole levels.

--8<-- "filters/emboss-tests.md"

## References

--8<-- "filters/emboss-references.md"
