# Add speckle noise

--8<-- "filters/noise-speckle-facts.md"

## Overview

Add speckle noise multiplies every pixel by a random factor around 1. Bright pixels change by more levels than dark ones, and black stays black. This is the noise model of the Lee, Kuan, Frost, Gamma-MAP and SRAD filters, so you can test them on a known noise level.

<figure markdown="span">
  ![A plot of one row of the gray ramp, before and after speckle noise. The noise is small on the dark left and large on the bright right.](../../assets/figures/noise-speckle-light.svg#only-light){ width="480" }
  ![A plot of one row of the gray ramp, before and after speckle noise. The noise is small on the dark left and large on the bright right.](../../assets/figures/noise-speckle-dark.svg#only-dark){ width="480" }
  <figcaption>Speckle grows with the brightness: the dark end is almost clean, the bright end very noisy.</figcaption>
</figure>

## How it works

1. Draw a standard normal number for each pixel and channel, from the seed and the position.
2. Multiply the value by 1 plus sigma times that number.
3. Clip the result to 0 to 255.

## Mathematical foundation

--8<-- "filters/noise-speckle-formula.md"

The factor has mean 1 and standard deviation sigma, so the noisy value has the clean value as its mean and sigma times the clean value as its standard deviation. Its coefficient of variation is sigma everywhere, so sigma is the C_u that the speckle filters need. This is the speckle mode of `skimage.util.random_noise`, which takes the variance instead of sigma.

## Kernel or operator

There is no kernel. The Inspector describes the random process with the current sigma.

## Algorithm

--8<-- "filters/noise-speckle-steps.md"

## Parameters

--8<-- "filters/noise-speckle-params.md"

## Implementation

`speckleNoiseFilter` in `web/src/core/filters/utility/noise.ts` uses the position-based normal numbers of Add Gaussian noise. They depend only on the seed, the position and the channel. So a strip gives the same noise as the whole image.

## Worked example

--8<-- "examples/noise-speckle.md"

## Complexity

--8<-- "filters/noise-speckle-complexity.md"

## Artifacts and limitations

--8<-- "filters/noise-speckle-limits.md"

## Tests

A test adds speckle with sigma 0.1 to a flat gray image of value 128. It checks that the mean stays 128 and the standard deviation is 12.8, within rounding.

--8<-- "filters/noise-speckle-tests.md"

## References

--8<-- "filters/noise-speckle-references.md"
