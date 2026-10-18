# Non-negative least-squares deconvolution

--8<-- "filters/nnls-deconv-facts.md"

## Overview

Non-negative least-squares deconvolution is Landweber iteration with one more rule: after each step, negative values are set to 0. The method is called projected Landweber. It keeps the result at black or above, which removes ringing below black.

<figure markdown="span">
  ![Three panels: blurred disks with noise, the projected Landweber result after 5 iterations, and after 50 iterations.](../../assets/figures/nnls-deconv-light.svg#only-light){ width="480" }
  ![Three panels: blurred disks with noise, the projected Landweber result after 5 iterations, and after 50 iterations.](../../assets/figures/nnls-deconv-dark.svg#only-dark){ width="480" }
  <figcaption>Projected Landweber on a Gaussian blur with sigma 2 and noise of sigma 2, after 5 and 50 iterations.</figcaption>
</figure>

## How it works

1. Start with the blurred image as the estimate, with negative values set to 0.
2. Take a Landweber step.
3. Set negative values to 0.
4. Repeat for the chosen number of iterations.

## Mathematical foundation

--8<-- "filters/nnls-deconv-formula.md"

Setting negative values to 0 is the projection onto the set of non-negative images. A gradient step followed by this projection is projected gradient descent, which solves least squares with the constraint f at least 0. For a PSF that adds up to 1, steps tau below 2 converge.

## Kernel or operator

The Inspector shows the update rule, tau and the number of iterations. The Iteration viewer in the Learn panel shows the estimate after a few iterations and the residual at every iteration.

## Algorithm

--8<-- "filters/nnls-deconv-steps.md"

## Parameters

--8<-- "filters/nnls-deconv-params.md"

## Implementation

`nnlsDeconvFilter` in `web/src/core/filters/restoration/iterative.ts` runs `iterate` with the projected Landweber method. The image is extended with the border mode by half its size, at most 256 pixels, on each side, and every convolution runs through the FFT of the extended grid. The filter needs the whole image, so it always runs on the whole image, and a selection is cut out of the result. It is slow, so its preview runs on request.

## Worked example

--8<-- "examples/nnls-deconv.md"

## Complexity

--8<-- "filters/nnls-deconv-complexity.md"

## Artifacts and limitations

--8<-- "filters/nnls-deconv-limits.md"

## Tests

The reference runs the same iteration with `numpy.fft` on the plane extended with `numpy.pad`. Before the cases are written, the script checks that 30 iterations bring a blurred plane closer to the original in the center of the image. Unit tests check that the result stays non-negative.

--8<-- "filters/nnls-deconv-tests.md"

## References

--8<-- "filters/nnls-deconv-references.md"
