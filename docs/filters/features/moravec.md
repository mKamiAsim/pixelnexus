# Moravec corner detector

--8<-- "filters/moravec-facts.md"

## Overview

The Moravec detector is the oldest corner detector. It moves a small window by one pixel in four directions and measures how much the window changes. The smallest change is the response, which is large only where every move changes the window, at a corner. The filter shows the response at every pixel, or the corner points.

<figure markdown="span">
  ![Three panels: two bright rectangles and a bright triangle on a dark background, the Moravec response with bright spots at the corners and along the slanted triangle edges, and the corner points at the same places.](../../assets/figures/moravec-light.svg#only-light){ width="480" }
  ![Three panels: two bright rectangles and a bright triangle on a dark background, the Moravec response with bright spots at the corners and along the slanted triangle edges, and the corner points at the same places.](../../assets/figures/moravec-dark.svg#only-dark){ width="480" }
  <figcaption>Moravec on bright shapes. The response is high at the corners and also along the slanted edges of the triangle, which fall between the four tested directions.</figcaption>
</figure>

## How it works

1. Take a small window around each pixel.
2. Move it one pixel right, down right, down and down left, and sum the squared differences for each move.
3. Keep the smallest sum as the response.
4. For corner points, keep the local maxima at or above the threshold.

## Mathematical foundation

--8<-- "filters/moravec-formula.md"

In a flat area no move changes the window. Along an edge, a move along the edge changes nothing, so the smallest change is 0. At a corner every move changes the window. Moravec tested only four directions, which Harris and Stephens list as (1, 0), (1, 1), (0, 1) and (-1, 1). An edge that runs between these directions changes for all four moves, so it gives false corners. Harris and Stephens replaced the four moves with the structure tensor, which covers every direction.

## Kernel or operator

There is no kernel. The Inspector lists the window sums for the four shifts and the minimum.

## Algorithm

--8<-- "filters/moravec-steps.md"

## Parameters

--8<-- "filters/moravec-params.md"

## Implementation

`moravecResponse` in `web/src/core/filters/features/corners.ts` squares the differences for each shift and sums them over the window with running sums. The filter extends the plane once by the support with the border mode, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/moravec.md"

## Complexity

--8<-- "filters/moravec-complexity.md"

## Artifacts and limitations

--8<-- "filters/moravec-limits.md"

## Tests

The reference computes the same sums with NumPy and `scipy.ndimage.uniform_filter`. The library scikit-image tests only the four diagonal shifts. Before the cases are written, the script runs the reference with those shifts and checks it against `skimage.feature.corner_moravec`. This confirms the window rule. The cases cover two window sizes and both outputs for all five border modes.

--8<-- "filters/moravec-tests.md"

## References

--8<-- "filters/moravec-references.md"
