# Robinson compass

--8<-- "filters/robinson-facts.md"

## Overview

The Robinson operator is a compass filter built from the Sobel mask. It turns the mask in eight steps of 45 degrees and keeps the strongest response. Its four axis-aligned masks give exactly the Sobel derivatives, with both signs.

<figure markdown="span">
  ![Three panels: disks, the largest Robinson response with bright rings at the disk edges, and the direction map with eight bands per ring.](../../assets/figures/robinson-light.svg#only-light){ width="480" }
  ![Three panels: disks, the largest Robinson response with bright rings at the disk edges, and the direction map with eight bands per ring.](../../assets/figures/robinson-dark.svg#only-dark){ width="480" }
  <figcaption>The largest response marks the edges. The direction map has eight values, one per mask.</figcaption>
</figure>

## How it works

1. Correlate the image with each of the eight turned Sobel masks.
2. Keep the largest response as the edge strength.
3. The direction of that mask is the edge direction.

## Mathematical foundation

--8<-- "filters/robinson-formula.md"

Opposite masks are negatives of each other, so the eight responses come in four pairs of opposite sign. The largest is always one of the four positive values. The axis-aligned masks give the Sobel G_x and G_y, and the diagonal masks give Sobel-like derivatives along the diagonals.

## Kernel or operator

The Inspector shows all eight masks, read from the code that turns them. The worked example below lists the eight responses for one window.

## Algorithm

--8<-- "filters/robinson-steps.md"

## Parameters

--8<-- "filters/robinson-params.md"

## Implementation

`compassFilter` in `web/src/core/filters/edges/compass.ts` turns the Sobel mask with `turnMask` and keeps the largest of the eight correlations. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/robinson.md"

## Complexity

--8<-- "filters/robinson-complexity.md"

## Artifacts and limitations

--8<-- "filters/robinson-limits.md"

## Tests

The reference turns the mask the same way. Before it is used, the script checks that the south mask equals `scipy.ndimage.sobel` along y. The test covers both outputs for all five border modes.

--8<-- "filters/robinson-tests.md"

## References

--8<-- "filters/robinson-references.md"
