# Landweber iteration

--8<-- "filters/landweber-facts.md"

## Overview

Landweber iteration undoes a known blur step by step. It moves the estimate a small step against the gradient of the squared error between the blurred estimate and the image. The number of iterations sets how much is restored, so it works as the only regularization.

<figure markdown="span">
  ![Three panels: blurred disks with noise, the Landweber result after 5 iterations, and after 50 iterations with sharper edges.](../../assets/figures/landweber-light.svg#only-light){ width="480" }
  ![Three panels: blurred disks with noise, the Landweber result after 5 iterations, and after 50 iterations with sharper edges.](../../assets/figures/landweber-dark.svg#only-dark){ width="480" }
  <figcaption>Landweber on a Gaussian blur with sigma 2 and noise of sigma 2, after 5 and 50 iterations.</figcaption>
</figure>

## How it works

1. Start with the blurred image as the estimate.
2. Blur the estimate and subtract it from the image.
3. Blur the difference with the PSF turned by a half turn, and add tau times it.
4. Repeat for the chosen number of iterations.

## Mathematical foundation

--8<-- "filters/landweber-formula.md"

The update is gradient descent on |h * f - g|^2. In the frequency domain each step multiplies the error at frequency f by 1 - tau |H|^2. A PSF that adds up to 1 has |H| at most 1, so steps tau below 2 converge. After K steps each frequency has covered 1 - (1 - tau |H|^2)^K of the way from g to the inverse filter result. Frequencies where H is strong come back fast and weak ones slowly, so stopping early holds back noise.

## Kernel or operator

The Inspector shows the update rule, tau and the number of iterations. The Iteration viewer in the Learn panel shows the estimate after a few iterations and the residual at every iteration.

## Algorithm

--8<-- "filters/landweber-steps.md"

## Parameters

--8<-- "filters/landweber-params.md"

## Implementation

`landweberFilter` in `web/src/core/filters/restoration/iterative.ts` runs `iterate`. The image is extended with the border mode by half its size, at most 256 pixels, on each side, and every convolution runs through the FFT of the extended grid. The filter needs the whole image, so it always runs on the whole image, and a selection is cut out of the result. It is slow, so its preview runs on request.

## Worked example

--8<-- "examples/landweber.md"

## Complexity

--8<-- "filters/landweber-complexity.md"

## Artifacts and limitations

--8<-- "filters/landweber-limits.md"

## Tests

The reference runs the same iteration with `numpy.fft` on the plane extended with `numpy.pad`. Before the cases are written, the script checks that 30 iterations bring a blurred plane closer to the original in the center of the image. A unit test checks that the residual never grows with step size 1.

--8<-- "filters/landweber-tests.md"

## References

--8<-- "filters/landweber-references.md"
