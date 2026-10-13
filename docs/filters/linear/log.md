# Laplacian of Gaussian

--8<-- "filters/log-facts.md"

## Overview

The Laplacian of Gaussian, LoG, smooths the image with a Gaussian and takes the Laplacian, the sum of the second derivatives. Both steps form one kernel, often called the Mexican hat. Edges are where the result crosses zero, and blobs of a size close to sigma give strong peaks.

<figure markdown="span">
  ![A plot of the 1D second derivative of a Gaussian with sigma 2, negative in the middle and slightly positive on both sides.](../../assets/figures/log-light.svg#only-light){ width="480" }
  ![A plot of the 1D second derivative of a Gaussian with sigma 2, negative in the middle and slightly positive on both sides.](../../assets/figures/log-dark.svg#only-dark){ width="480" }
  <figcaption>The 1D second derivative of a Gaussian with sigma 2: negative in the middle, positive on both sides.</figcaption>
</figure>

## How it works

1. Smooth the image with a Gaussian.
2. Take the second derivative along x and along y.
3. Add the two. Both steps run as one separable kernel per term.

## Mathematical foundation

--8<-- "filters/log-formula.md"

Because smoothing and differentiation are linear, the Laplacian of the smoothed image equals the image correlated with the Laplacian of the Gaussian. Each second derivative is separable, so the filter runs as two sums of two 1D passes. The kernel weights are the normalized Gaussian times (x^2 / sigma^4 - 1 / sigma^2), as in `scipy.ndimage.gaussian_laplace`, truncated at 4 sigma. The kernel adds up to nearly 0.

## Kernel or operator

The Inspector shows the 2D kernel, built from the 1D kernels the filter runs. The Impulse response demo shows the Mexican hat.

## Algorithm

--8<-- "filters/log-steps.md"

## Parameters

--8<-- "filters/log-params.md"

## Implementation

`logFilter` in `web/src/core/filters/linear/dog-log.ts` correlates with the second derivative kernel along one axis and the Gaussian along the other, for both axes, and adds the results. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/log.md"

## Complexity

--8<-- "filters/log-complexity.md"

## Artifacts and limitations

--8<-- "filters/log-limits.md"

## Tests

The reference is `scipy.ndimage.gaussian_laplace`. The test covers two sigmas for all five border modes, within the float tolerance.

--8<-- "filters/log-tests.md"

## References

--8<-- "filters/log-references.md"
