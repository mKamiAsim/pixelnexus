# White balance

--8<-- "filters/white-balance-facts.md"

## Overview

White balance removes a color cast with one color you pick. The picked color should be neutral, such as a gray card, a white wall or a sheet of paper. The filter finds the gains that turn it gray and applies them to the whole image. Set the probe on the neutral object with the Probe tool, then press Use probe pixel.

<figure markdown="span">
  ![Two panels: the color chart with a strong orange cast, and the same chart after white balance on a gray of the ramp, with neutral grays and natural colors.](../../assets/figures/white-balance-light.svg#only-light){ width="480" }
  ![Two panels: the color chart with a strong orange cast, and the same chart after white balance on a gray of the ramp, with neutral grays and natural colors.](../../assets/figures/white-balance-dark.svg#only-dark){ width="480" }
  <figcaption>The chart with a tungsten cast, made by adapting it from D65 to illuminant A, and after white balance on a gray of the ramp.</figcaption>
</figure>

## How it works

1. Pick the color of something that should be neutral.
2. Decode it to linear light and compute its luminance.
3. Compute for each channel the gain that brings it to that luminance.
4. Multiply every pixel by the gains, in linear light.

## Mathematical foundation

--8<-- "filters/white-balance-formula.md"

A change in the color of the light multiplies each channel of a surface by about the same factor everywhere in the image. Undoing it needs one gain per channel, a diagonal matrix. That is the von Kries model of adaptation. One neutral surface is enough to find the gains, since its true color is known to be gray.

## Kernel or operator

The Inspector shows the three gains for the current neutral color, and whether they act on linear or encoded values.

## Algorithm

--8<-- "filters/white-balance-steps.md"

## Parameters

--8<-- "filters/white-balance-params.md"

## Implementation

`whiteBalanceFilter` in `web/src/core/filters/enhancement/white-balance.ts` computes the gains with `neutralGains`. The color parameter has its own control: a hex field, the system color picker, and a button that takes the stored color of the image at the probe pixel.

## Worked example

--8<-- "examples/white-balance.md"

## Complexity

--8<-- "filters/white-balance-complexity.md"

## Artifacts and limitations

--8<-- "filters/white-balance-limits.md"

## Tests

The reference computes the same steps with NumPy on a small RGB test image with saturated, gray, black and white pixels, and compares all three channels. The cases cover a warm and a cool neutral, a gray neutral that changes nothing, and both settings of Linear light.

--8<-- "filters/white-balance-tests.md"

## References

--8<-- "filters/white-balance-references.md"
