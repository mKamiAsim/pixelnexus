# Farid-Simoncelli derivative filter

--8<-- "filters/farid-simoncelli-facts.md"

## Overview

The Farid-Simoncelli filter estimates the gradient with a 5-tap derivative and a 5-tap prefilter that were designed together. The derivative is as close as possible to the true derivative of the prefilter, so the gradient direction is accurate for edges at any angle.

<figure markdown="span">
  ![Two panels: a Siemens star and its Farid gradient magnitude, smooth and even around the star.](../../assets/figures/farid-simoncelli-light.svg#only-light){ width="480" }
  ![Two panels: a Siemens star and its Farid gradient magnitude, smooth and even around the star.](../../assets/figures/farid-simoncelli-dark.svg#only-dark){ width="480" }
  <figcaption>The 5-tap Farid kernels give smooth, even edge strength around the star.</figcaption>
</figure>

## How it works

1. Smooth along the edge with the 5-tap prefilter.
2. Take the 5-tap derivative across the edge.
3. Combine the two directions into the magnitude or the direction.

## Mathematical foundation

--8<-- "filters/farid-simoncelli-formula.md"

Farid and Simoncelli observe that a discrete derivative is only meaningful together with an interpolation: the derivative of a smooth function that fits the samples. They choose the prefilter p and the derivative d together, to minimize the error between d and the derivative of p in the frequency domain, weighted for rotation invariance. The taps here are those of `skimage.filters.farid`.

## Kernel or operator

The Inspector shows the kernels that run, read from the same code. The Impulse response demo in the Learn panel shows how one bright pixel spreads through them.

## Algorithm

--8<-- "filters/farid-simoncelli-steps.md"

## Parameters

--8<-- "filters/farid-simoncelli-params.md"

## Implementation

`faridFilter` in `web/src/core/filters/edges/gradients.ts` runs each kernel as two 1D passes of 5 taps and combines the results like the Sobel filter. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/farid-simoncelli.md"

## Complexity

--8<-- "filters/farid-simoncelli-complexity.md"

## Artifacts and limitations

--8<-- "filters/farid-simoncelli-limits.md"

## Tests

The reference correlates with the two kernels. Before it is used, the script checks the magnitude against `skimage.filters.farid`, which divides by the square root of 2. The test covers the magnitudes and both derivatives for all five border modes. The direction is left out of the test. The taps are not whole numbers, so tiny values near 0 give angles near 180 or -180 degrees that depend on rounding.

--8<-- "filters/farid-simoncelli-tests.md"

## References

--8<-- "filters/farid-simoncelli-references.md"
