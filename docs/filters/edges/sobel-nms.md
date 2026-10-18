# Sobel with non-maximum suppression

--8<-- "filters/sobel-nms-facts.md"

## Overview

Sobel with non-maximum suppression keeps the Sobel edge strength only where it peaks across the edge. The Sobel magnitude of an edge is two or three pixels wide. Suppression keeps its ridge line and sets the rest to 0, so edges become one pixel thick. It is the second stage of the Canny detector, shown here on its own.

<figure markdown="span">
  ![Three panels: bright disks, their Sobel magnitude with wide bright rings, and the result with suppression, with thin rings one pixel wide.](../../assets/figures/sobel-nms-light.svg#only-light){ width="480" }
  ![Three panels: bright disks, their Sobel magnitude with wide bright rings, and the result with suppression, with thin rings one pixel wide.](../../assets/figures/sobel-nms-dark.svg#only-dark){ width="480" }
  <figcaption>The Sobel magnitude is two or three pixels wide. Non-maximum suppression keeps its ridge line.</figcaption>
</figure>

## How it works

1. Compute the Sobel strength and direction at every pixel.
2. Round the direction to horizontal, vertical or one of the two diagonals.
3. Keep the strength only if it is at least as large as both neighbors along that direction.

## Mathematical foundation

--8<-- "filters/sobel-nms-formula.md"

Across an edge, the gradient magnitude rises to a peak and falls again. The peak is where the brightness changes fastest, the best place for the edge. Comparing each pixel with its neighbors along the gradient finds that peak. The direction is rounded to four sectors 45 degrees apart, as in Gonzalez and Woods. Canny used this step in his detector, before hysteresis thresholding.

## Kernel or operator

There is no single kernel. The Sobel kernels are on the Sobel page. The worked example below follows one row across an edge.

## Algorithm

--8<-- "filters/sobel-nms-steps.md"

## Parameters

--8<-- "filters/sobel-nms-params.md"

## Implementation

`suppress` in `web/src/core/filters/edges/nms.ts` compares each magnitude with its two neighbors along the rounded direction. The filter extends the plane once by two pixels with the border mode, computes the Sobel derivatives, suppresses, and cuts the extension off. It runs in the browser engine, in Web Workers, through the shared filter framework, and works on luma by default.

## Worked example

--8<-- "examples/sobel-nms.md"

## Complexity

--8<-- "filters/sobel-nms-complexity.md"

## Artifacts and limitations

--8<-- "filters/sobel-nms-limits.md"

## Tests

The reference computes `scipy.ndimage.sobel` on the extended plane and applies the same four-sector rule with NumPy. The test covers all five border modes.

--8<-- "filters/sobel-nms-tests.md"

## References

--8<-- "filters/sobel-nms-references.md"
