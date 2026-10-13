# Adaptive local noise reduction

--8<-- "filters/adaptive-local-noise-facts.md"

## Overview

The adaptive local noise reduction filter of Gonzalez and Woods subtracts a share of the difference between each pixel and its local mean. The share is the noise variance divided by the local variance, at most 1. In flat, noisy areas the pixel becomes the local mean. Near edges, where the local variance is large, the pixel stays almost as it is.

<figure markdown="span">
  ![Three panels: disks with Gaussian noise, the adaptive filter result with sharp edges and smooth flat areas, and a 7x7 box filter that blurs the edges.](../../assets/figures/adaptive-local-noise-light.svg#only-light){ width="480" }
  ![Three panels: disks with Gaussian noise, the adaptive filter result with sharp edges and smooth flat areas, and a 7x7 box filter that blurs the edges.](../../assets/figures/adaptive-local-noise-dark.svg#only-dark){ width="480" }
  <figcaption>With the noise level known, the adaptive filter keeps the edges that a 7x7 mean blurs.</figcaption>
</figure>

## How it works

1. Find the local mean and the local variance of the window.
2. Divide the noise variance by the local variance, at most 1.
3. Subtract that share of the difference between the pixel and the mean.

## Mathematical foundation

--8<-- "filters/adaptive-local-noise-formula.md"

Gonzalez and Woods ask for three things. Where the noise variance is 0, return g. Where the local variance is high, return a value close to g. Where the two variances are equal, return the local mean. The formula meets all three. With the ratio limited to 1, it is the same estimator as the adaptive Wiener filter of Lee (1980). The two entries exist because the textbook and the literature name it differently.

## Kernel or operator

There is no kernel. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window values at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/adaptive-local-noise-steps.md"

## Parameters

--8<-- "filters/adaptive-local-noise-params.md"

## Implementation

`adaptiveLocalNoiseFilter` in `web/src/core/filters/adaptive/local-noise.ts` shares `localNoisePlane` with the adaptive Wiener filter. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/adaptive-local-noise.md"

## Complexity

--8<-- "filters/adaptive-local-noise-complexity.md"

## Artifacts and limitations

--8<-- "filters/adaptive-local-noise-limits.md"

## Tests

The reference and its checks are the same as for the adaptive Wiener filter. The formula runs on NumPy windows and is checked against `scipy.signal.wiener` and against the box mean for a huge noise level. The test covers two sizes and noise levels for all five border modes.

--8<-- "filters/adaptive-local-noise-tests.md"

## References

--8<-- "filters/adaptive-local-noise-references.md"
