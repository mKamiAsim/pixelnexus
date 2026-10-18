# Prewitt

--8<-- "filters/prewitt-facts.md"

## Overview

The Prewitt operator estimates the brightness gradient with two 3x3 kernels. Each takes a difference across the edge and a plain sum of three rows along it. It is the simplest of the classic gradient kernels and gives almost the same edges as Sobel.

<figure markdown="span">
  ![Three panels: bright disks on a dark background, the Prewitt gradient magnitude with bright rings at the disk edges, and the Sobel magnitude, which looks almost the same.](../../assets/figures/prewitt-light.svg#only-light){ width="480" }
  ![Three panels: bright disks on a dark background, the Prewitt gradient magnitude with bright rings at the disk edges, and the Sobel magnitude, which looks almost the same.](../../assets/figures/prewitt-dark.svg#only-dark){ width="480" }
  <figcaption>Prewitt and Sobel give almost the same edges. Sobel weights the middle row more.</figcaption>
</figure>

## How it works

1. Take the difference between the right and left columns of the window for G_x.
2. Take the difference between the bottom and top rows for G_y.
3. Combine them into the magnitude or the direction.

## Mathematical foundation

--8<-- "filters/prewitt-formula.md"

Each Prewitt kernel is separable: a central difference (-1, 0, 1) times a box (1, 1, 1). The box smooths less than the Sobel weights. So Prewitt is a little more sensitive to noise and a little less rotation invariant. scikit-image divides the kernels by 3. Here they keep their whole-number weights, as in Gonzalez and Woods.

## Kernel or operator

The Inspector shows the kernels that run, read from the same code. The Impulse response demo in the Learn panel shows how one bright pixel spreads through them.

## Algorithm

--8<-- "filters/prewitt-steps.md"

## Parameters

--8<-- "filters/prewitt-params.md"

## Implementation

`prewittFilter` in `web/src/core/filters/edges/gradients.ts` runs each kernel as two 1D passes and combines the results with the code of the Sobel filter. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/prewitt.md"

## Complexity

--8<-- "filters/prewitt-complexity.md"

## Artifacts and limitations

--8<-- "filters/prewitt-limits.md"

## Tests

The reference correlates with the two kernels using `scipy.ndimage.correlate`. Before it is used, the script checks that the horizontal kernel is three times `skimage.filters.prewitt` along x. The test covers the magnitude with both norms, both derivatives and the direction, for all five border modes.

--8<-- "filters/prewitt-tests.md"

## References

--8<-- "filters/prewitt-references.md"
