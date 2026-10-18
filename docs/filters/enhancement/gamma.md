# Gamma correction

--8<-- "filters/gamma-facts.md"

## Overview

Gamma correction bends the brightness curve with a power function. The middle tones get brighter or darker, while black and white stay where they are.

<figure markdown="span">
  ![A plot of output value against input value for gamma 0.5, 1 and 2.2.](../../assets/figures/gamma-light.svg#only-light){ width="480" }
  ![A plot of output value against input value for gamma 0.5, 1 and 2.2.](../../assets/figures/gamma-dark.svg#only-dark){ width="480" }
  <figcaption>Gamma below 1 lifts the midtones, gamma above 1 lowers them. 0 and 255 stay fixed.</figcaption>
</figure>

## How it works

1. Turn the pixel value into a number from 0 to 1.
2. Raise it to the power gamma.
3. Turn it back into a value from 0 to 255 and round it.

## Mathematical foundation

--8<-- "filters/gamma-formula.md"

Raising a number between 0 and 1 to a power keeps 0 and 1 in place. A power below 1 moves every value in between up, a power above 1 moves it down. The curve is steepest where the tones are stretched, which can show banding in smooth gradients.

## Kernel or operator

Gamma is a point operation, so it has no kernel. The Inspector shows the transfer curve: the output for each of the 256 input values, from the same function the filter runs.

## Algorithm

--8<-- "filters/gamma-steps.md"

## Parameters

--8<-- "filters/gamma-params.md"

## Implementation

`gammaTransfer` gives the curve. The filter computes it once for the 256 input values and then looks up each pixel. Brightness values that are not whole numbers use the formula directly. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/gamma.md"

## Complexity

--8<-- "filters/gamma-complexity.md"

## Artifacts and limitations

--8<-- "filters/gamma-limits.md"

## Tests

The curve is compared with `skimage.exposure.adjust_gamma` for gamma 0.45, 1 and 2.2 at all 256 input values, within 1e-6.

--8<-- "filters/gamma-tests.md"

## References

--8<-- "filters/gamma-references.md"
