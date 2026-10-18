# Regularized Richardson-Lucy

--8<-- "filters/regularized-rl-facts.md"

## Overview

Regularized Richardson-Lucy adds a total variation term to Richardson-Lucy deconvolution. Plain Richardson-Lucy raises noise into speckle after many iterations. The extra term lowers small bumps and fills small dips at each step, so flat areas stay flat while edges stay sharp.

<figure markdown="span">
  ![Three panels: blurred disks with noise, the regularized Richardson-Lucy result after 5 iterations, and after 50 iterations with sharp disks and flat background.](../../assets/figures/regularized-rl-light.svg#only-light){ width="480" }
  ![Three panels: blurred disks with noise, the regularized Richardson-Lucy result after 5 iterations, and after 50 iterations with sharp disks and flat background.](../../assets/figures/regularized-rl-dark.svg#only-dark){ width="480" }
  <figcaption>Regularized Richardson-Lucy on a Gaussian blur with sigma 2 and noise of sigma 2, after 5 and 50 iterations.</figcaption>
</figure>

## How it works

1. Start with the blurred image as the estimate.
2. Take a Richardson-Lucy step.
3. Divide it by 1 - lambda times the curvature of the estimate.
4. Repeat for the chosen number of iterations.

## Mathematical foundation

--8<-- "filters/regularized-rl-formula.md"

Total variation is the sum of |grad f| over the image. It is small for images made of flat areas with sharp edges, and large for noise. Dey and colleagues add it to the Poisson likelihood of Richardson-Lucy. Its gradient is minus the curvature div(grad f / |grad f|), and they put it in the divisor of the multiplicative update. This filter computes the curvature with forward and backward differences and sqrt(f_x^2 + f_y^2 + 0.01^2) for |grad f|, its own discretization.

## Kernel or operator

The Inspector shows the update rule, lambda and the number of iterations. The Iteration viewer in the Learn panel shows the estimate after a few iterations and the residual at every iteration.

## Algorithm

--8<-- "filters/regularized-rl-steps.md"

## Parameters

--8<-- "filters/regularized-rl-params.md"

## Implementation

`regularizedRlFilter` in `web/src/core/filters/restoration/iterative.ts` runs `iterate` with the curvature from `tvCurvature`. The image is extended with the border mode by half its size, at most 256 pixels, on each side, and every convolution runs through the FFT of the extended grid. The filter needs the whole image, so it always runs on the whole image, and a selection is cut out of the result. It is slow, so its preview runs on request.

## Worked example

--8<-- "examples/regularized-rl.md"

## Complexity

--8<-- "filters/regularized-rl-complexity.md"

## Artifacts and limitations

--8<-- "filters/regularized-rl-limits.md"

## Tests

The reference runs the same iteration and the same curvature, built with `numpy.roll`, on the plane extended with `numpy.pad`. The cases cover two PSFs and two values of lambda.

--8<-- "filters/regularized-rl-tests.md"

## References

--8<-- "filters/regularized-rl-references.md"
