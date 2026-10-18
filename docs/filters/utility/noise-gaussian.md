# Add Gaussian noise

--8<-- "filters/noise-gaussian-facts.md"

## Overview

This tool adds random values with a normal distribution to an image. Use it to make test images for denoising filters, with a noise level you know exactly.

<figure markdown="span">
  ![A histogram of pixel values after adding Gaussian noise with sigma 20 to a flat gray of 128, with the normal curve drawn on top.](../../assets/figures/noise-gaussian-light.svg#only-light){ width="480" }
  ![A histogram of pixel values after adding Gaussian noise with sigma 20 to a flat gray of 128, with the normal curve drawn on top.](../../assets/figures/noise-gaussian-dark.svg#only-dark){ width="480" }
  <figcaption>Gaussian noise with sigma 20 on a flat gray of 128 gives a bell-shaped histogram.</figcaption>
</figure>

## How it works

1. For each pixel and channel, pick a random number. Most numbers are near 0.
2. Multiply it by sigma.
3. Add it to the value, and keep the result between 0 and 255.

## Mathematical foundation

--8<-- "filters/noise-gaussian-formula.md"

The added values are independent and follow a normal distribution with mean 0 and standard deviation sigma. Each one comes from two uniform random numbers through the Box-Muller transform. Clipping at 0 and 255 changes the distribution for values near black and white.

## Kernel or operator

The Inspector shows the distribution and the seed rule, not a kernel. The random numbers depend only on the seed, the pixel position and the channel. So a region gets the same noise as the whole image, and the same seed always repeats the same noise.

## Algorithm

--8<-- "filters/noise-gaussian-steps.md"

## Parameters

--8<-- "filters/noise-gaussian-params.md"

## Implementation

`positionNormal` turns the seed, the position and the channel into a normal number. It hashes them with an integer hash by Chris Wellons and applies Box-Muller. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/noise-gaussian.md"

## Complexity

--8<-- "filters/noise-gaussian-complexity.md"

## Artifacts and limitations

--8<-- "filters/noise-gaussian-limits.md"

## Tests

One test checks that the standard deviation on a flat image is within 0.3 of sigma. Others check that the same seed gives the same pixels, a different seed gives different pixels, and any region matches the whole image.

--8<-- "filters/noise-gaussian-tests.md"

## References

--8<-- "filters/noise-gaussian-references.md"
