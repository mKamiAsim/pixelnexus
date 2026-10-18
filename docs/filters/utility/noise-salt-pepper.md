# Add salt-and-pepper noise

--8<-- "filters/noise-salt-pepper-facts.md"

## Overview

This tool turns a random share of the pixels pure white or pure black. It makes test images with impulse noise, the kind that the median filter removes well.

<figure markdown="span">
  ![Three panels: a gray ramp, and the same ramp with salt-and-pepper noise of amount 0.05 and 0.2.](../../assets/figures/noise-salt-pepper-light.svg#only-light){ width="480" }
  ![Three panels: a gray ramp, and the same ramp with salt-and-pepper noise of amount 0.05 and 0.2.](../../assets/figures/noise-salt-pepper-dark.svg#only-dark){ width="480" }
  <figcaption>With amount 0.05, about 5 in every 100 pixels become white or black.</figcaption>
</figure>

## How it works

1. For each pixel, pick a random number between 0 and 1.
2. If it is below the amount, the pixel becomes noise.
3. Pick a second number to choose white or black.
4. All other pixels stay as they are.

## Mathematical foundation

--8<-- "filters/noise-salt-pepper-formula.md"

Each pixel becomes noise with probability p, the amount, independently of the others. A noisy pixel is white with probability s, the salt share, and black otherwise. The noise replaces the value, so a noisy pixel carries no information about the true value.

## Kernel or operator

The Inspector shows the probabilities and the seed rule. The two uniform numbers depend only on the seed and the pixel position.

## Algorithm

--8<-- "filters/noise-salt-pepper-steps.md"

## Parameters

--8<-- "filters/noise-salt-pepper-params.md"

## Implementation

`positionUniform` makes the two numbers for each pixel. All three channels of a noisy pixel get the same value, so the dots are white or black, not colored. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/noise-salt-pepper.md"

## Complexity

--8<-- "filters/noise-salt-pepper-complexity.md"

## Artifacts and limitations

--8<-- "filters/noise-salt-pepper-limits.md"

## Tests

One test checks that the share of noisy pixels is within 0.01 of the amount. Another checks that the share of white dots is within 0.05 of the salt share. A third checks that any region matches the whole image.

--8<-- "filters/noise-salt-pepper-tests.md"

## References

--8<-- "filters/noise-salt-pepper-references.md"
