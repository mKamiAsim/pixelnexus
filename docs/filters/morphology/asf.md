# Alternating sequential filter

--8<-- "filters/asf-facts.md"

## Overview

An alternating sequential filter opens and closes the image with an element of size 1, then size 2, and so on up to a chosen size. It removes bright and dark details of growing size step by step, which disturbs large structures less than one large opening and closing.

<figure markdown="span">
  ![Two panels: noisy bright disks with white and black specks, and the result of the alternating sequential filter, with clean disks and no specks.](../../assets/figures/asf-light.svg#only-light){ width="480" }
  ![Two panels: noisy bright disks with white and black specks, and the result of the alternating sequential filter, with clean disks and no specks.](../../assets/figures/asf-dark.svg#only-dark){ width="480" }
  <figcaption>An alternating sequential filter with disks up to size 2 removes both the white and the black specks.</figcaption>
</figure>

## How it works

1. Open and close with the element of size 1.
2. Open and close with the element of size 2.
3. Continue up to the largest size.

## Mathematical foundation

--8<-- "filters/asf-formula.md"

An opening alone removes bright noise and a closing alone dark noise, and a large element in one step also damages large structures. Serra proposed alternating openings and closings with growing elements. Each stage removes the details of its size, so the later, larger stages see an image that is already simpler.

## Kernel or operator

There is no single kernel. The Inspector lists the stages, one per size, with their elements.

## Algorithm

--8<-- "filters/asf-steps.md"

## Parameters

--8<-- "filters/asf-params.md"

## Implementation

`asfFilter` in `web/src/core/filters/morphology/reconstruction.ts` extends the image once by the reach of all stages with the border mode, runs the openings and closings from `web/src/core/filters/morphology/gray.ts`, and cuts the extension off. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope and alpha.

## Worked example

--8<-- "examples/asf.md"

## Complexity

--8<-- "filters/asf-complexity.md"

## Artifacts and limitations

--8<-- "filters/asf-limits.md"

## Tests

The reference runs `scipy.ndimage.grey_erosion` and `grey_dilation` with the same elements on the extended plane. The cases cover two shapes, two sizes, both orders and all five border modes.

--8<-- "filters/asf-tests.md"

## References

--8<-- "filters/asf-references.md"
