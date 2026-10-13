# Roberts Cross

--8<-- "filters/roberts-facts.md"

## Overview

The Roberts cross operator, from 1963, is one of the first edge detectors. It uses the two diagonal differences of a 2x2 block of pixels. It has no smoothing, so edges stay thin, but every noisy pixel shows up as an edge.

<figure markdown="span">
  ![Three panels: noisy disks, the Roberts magnitude with thin edges and a lot of noise, and the Sobel magnitude with smoother edges and less noise.](../../assets/figures/roberts-light.svg#only-light){ width="480" }
  ![Three panels: noisy disks, the Roberts magnitude with thin edges and a lot of noise, and the Sobel magnitude with smoother edges and less noise.](../../assets/figures/roberts-dark.svg#only-dark){ width="480" }
  <figcaption>Roberts has no smoothing, so it finds thin edges but also every noisy pixel.</figcaption>
</figure>

## How it works

1. Subtract the pixel below right from the pixel.
2. Subtract the pixel below from the pixel to the right.
3. Combine the two differences into a magnitude.

## Mathematical foundation

--8<-- "filters/roberts-formula.md"

The two differences are the gradient along the two diagonals. Their L2 combination is the gradient strength, as for the other operators. A 2x2 block has no center pixel, so the result belongs half a pixel down and to the right. Here the differences run as 3x3 kernels with the pixel at the center. scikit-image divides the magnitude by the square root of 2.

## Kernel or operator

The Inspector shows the kernels that run, read from the same code. The Impulse response demo in the Learn panel shows how one bright pixel spreads through them.

## Algorithm

--8<-- "filters/roberts-steps.md"

## Parameters

--8<-- "filters/roberts-params.md"

## Implementation

`robertsFilter` in `web/src/core/filters/edges/gradients.ts` correlates with the two kernels and combines the results like the Sobel filter. The direction output is the angle of the pair, the gradient angle turned by 45 degrees. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/roberts.md"

## Complexity

--8<-- "filters/roberts-complexity.md"

## Artifacts and limitations

--8<-- "filters/roberts-limits.md"

## Tests

The reference correlates with the two kernels. Before it is used, the script checks the magnitude against `skimage.filters.roberts`. The test covers all outputs for all five border modes.

--8<-- "filters/roberts-tests.md"

## References

--8<-- "filters/roberts-references.md"
