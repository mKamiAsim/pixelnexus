# Adaptive Wiener filter

--8<-- "filters/wiener-adaptive-facts.md"

## Overview

The adaptive Wiener filter moves each pixel toward the mean of its window by an amount that depends on how much the window varies. Where it varies about as much as the noise, the window is taken as flat and the pixel becomes the mean. Where it varies much more, there is real detail, and the pixel is kept. So flat areas are smoothed and edges stay.

<figure markdown="span">
  ![Three panels: disks with Gaussian noise, the adaptive Wiener result with smooth flat areas and sharp disk edges, and a 5x5 box filter that blurs the edges.](../../assets/figures/wiener-adaptive-light.svg#only-light){ width="480" }
  ![Three panels: disks with Gaussian noise, the adaptive Wiener result with smooth flat areas and sharp disk edges, and a 5x5 box filter that blurs the edges.](../../assets/figures/wiener-adaptive-dark.svg#only-dark){ width="480" }
  <figcaption>The adaptive Wiener filter smooths the flat areas and leaves the disk edges sharp. The box filter blurs both.</figcaption>
</figure>

## How it works

1. Find the mean m and the variance s^2 of the window.
2. Compare s^2 with the noise variance n^2.
3. Move the pixel toward m by the share n^2 / s^2, or all the way when s^2 is not larger than n^2.

## Mathematical foundation

--8<-- "filters/wiener-adaptive-formula.md"

Lee (1980) derived this estimate for an image with additive white noise: the best linear estimate of the signal from the local mean and variance. The signal variance is s^2 - n^2, and the gain is the signal variance over the total variance. The same formula is used by MATLAB's wiener2 and by `scipy.signal.wiener`. Those estimate n^2 as the mean of all local variances when it is not given. Here it is a parameter, so that a strip of the image gives the same result as the whole image.

## Kernel or operator

There is no kernel. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window values at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/wiener-adaptive-steps.md"

## Parameters

--8<-- "filters/wiener-adaptive-params.md"

## Implementation

`localNoisePlane` in `web/src/core/filters/adaptive/local-noise.ts` computes the local mean and variance with running sums in float64 and applies the gain. The adaptive local noise reduction filter uses the same function. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/wiener-adaptive.md"

## Complexity

--8<-- "filters/wiener-adaptive-complexity.md"

## Artifacts and limitations

--8<-- "filters/wiener-adaptive-limits.md"

## Tests

The reference applies the same formula to NumPy windows. Before it is used, the script checks it against `scipy.signal.wiener`, which pads with zeros, in the constant mode, and checks that a huge noise level gives the box mean. The test covers two sizes and noise levels for all five border modes.

--8<-- "filters/wiener-adaptive-tests.md"

## References

--8<-- "filters/wiener-adaptive-references.md"
