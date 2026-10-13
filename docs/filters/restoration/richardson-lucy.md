# Richardson-Lucy

--8<-- "filters/richardson-lucy-facts.md"

## Overview

Richardson-Lucy deconvolution undoes a known blur step by step. It blurs the current estimate, compares it with the image as a ratio, and multiplies the estimate by the ratio spread back with the blur. Values stay positive and the total brightness is kept, which suits astronomy and microscopy images with photon noise.

<figure markdown="span">
  ![Three panels: blurred disks with noise, the Richardson-Lucy result after 5 iterations, and after 50 iterations with sharper edges and some speckle.](../../assets/figures/richardson-lucy-light.svg#only-light){ width="480" }
  ![Three panels: blurred disks with noise, the Richardson-Lucy result after 5 iterations, and after 50 iterations with sharper edges and some speckle.](../../assets/figures/richardson-lucy-dark.svg#only-dark){ width="480" }
  <figcaption>Richardson-Lucy on a Gaussian blur with sigma 2 and noise of sigma 2, after 5 and 50 iterations.</figcaption>
</figure>

## How it works

1. Start with the blurred image as the estimate.
2. Blur the estimate and divide the image by it.
3. Blur the ratio with the PSF turned by a half turn, and multiply the estimate by it.
4. Repeat for the chosen number of iterations.

## Mathematical foundation

--8<-- "filters/richardson-lucy-formula.md"

Richardson and Lucy derived the update from Bayes' rule. It is the expectation maximization algorithm for an image with Poisson noise, so its limit is the maximum likelihood estimate. Each factor is positive, so a positive start stays positive. With a PSF that adds up to 1 the total brightness is kept. Stopping after a few iterations keeps the noise down, since later iterations fit the noise too.

## Kernel or operator

The Inspector shows the update rule and the number of iterations. The Iteration viewer in the Learn panel shows the estimate after a few iterations and the residual at every iteration.

## Algorithm

--8<-- "filters/richardson-lucy-steps.md"

## Parameters

--8<-- "filters/richardson-lucy-params.md"

## Implementation

`richardsonLucyFilter` in `web/src/core/filters/restoration/iterative.ts` runs `iterate`. Values of the blurred estimate below 1e-12 count as 1e-12, so the ratio stays finite. The image is extended with the border mode by half its size, at most 256 pixels, on each side, and every convolution runs through the FFT of the extended grid. The filter needs the whole image, so it always runs on the whole image, and a selection is cut out of the result. It is slow, so its preview runs on request.

## Worked example

--8<-- "examples/richardson-lucy.md"

## Complexity

--8<-- "filters/richardson-lucy-complexity.md"

## Artifacts and limitations

--8<-- "filters/richardson-lucy-limits.md"

## Tests

The reference runs the same iteration with `numpy.fft` on the plane extended with `numpy.pad`. Before the cases are written, the script checks that 30 iterations bring a blurred plane closer to the original in the center of the image. Unit tests check that the result stays non-negative.

--8<-- "filters/richardson-lucy-tests.md"

## References

--8<-- "filters/richardson-lucy-references.md"
