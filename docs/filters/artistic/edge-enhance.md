# Edge enhance

--8<-- "filters/edge-enhance-facts.md"

## Overview

Edge enhance is one-click sharpening with Pillow's fixed kernels. It adds a Laplacian to the image, which makes edges steeper and leaves flat areas as they were.

<figure markdown="span">
  ![Two panels: white disks on a dark background, and the same disks with crisper edges and a thin bright rim.](../../assets/figures/edge-enhance-light.svg#only-light){ width="480" }
  ![Two panels: white disks on a dark background, and the same disks with crisper edges and a thin bright rim.](../../assets/figures/edge-enhance-dark.svg#only-dark){ width="480" }
  <figcaption>The test disks, and edge enhance with the default settings.</figcaption>
</figure>

## How it works

1. Compare each pixel with its 8 neighbors.
2. Push the pixel away from their mean by a fixed amount.
3. Clip the result to 0 to 255.

## Mathematical foundation

--8<-- "filters/edge-enhance-formula.md"

Laplacian sharpening adds c times the Laplacian to the image. The normal kernel uses c = 1/2 and the more kernel c = 1, so a step from 50 to 200 overshoots more with the more kernel. Laplacian sharpening offers the same with an amount you can set.

## Kernel or operator

The Inspector shows the chosen 3 x 3 kernel.

## Algorithm

--8<-- "filters/edge-enhance-steps.md"

## Parameters

--8<-- "filters/edge-enhance-params.md"

## Implementation

`edgeEnhanceFilter` in `web/src/core/filters/artistic/kernels.ts` correlates the image with `edgeEnhanceRows`.

## Worked example

--8<-- "examples/edge-enhance.md"

## Complexity

--8<-- "filters/edge-enhance-complexity.md"

## Artifacts and limitations

--8<-- "filters/edge-enhance-limits.md"

## Tests

The fixture cases compare every pixel with scipy.ndimage.correlate and the same kernels, for both strengths and three border modes. Before the cases are written, the results are checked against Pillow's EDGE_ENHANCE and EDGE_ENHANCE_MORE away from the edge.

--8<-- "filters/edge-enhance-tests.md"

## References

--8<-- "filters/edge-enhance-references.md"
