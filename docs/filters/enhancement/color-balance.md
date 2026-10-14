# Color balance

--8<-- "filters/color-balance-facts.md"

## Overview

Color balance shifts the colors of the shadows, the midtones and the highlights on their own. Each range has three sliders: cyan to red, magenta to green, and yellow to blue. It follows the masks of GIMP's Color Balance, and can keep the brightness of every pixel.

<figure markdown="span">
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart with warm midtones, and the chart with blue-green shadows and orange highlights.](../../assets/figures/color-balance-light.svg#only-light){ width="480" }
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart with warm midtones, and the chart with blue-green shadows and orange highlights.](../../assets/figures/color-balance-dark.svg#only-dark){ width="480" }
  <figcaption>Color balance: warm midtones, the default, and teal shadows with orange highlights.</figcaption>
</figure>

## How it works

1. Compute the HSL lightness of the pixel.
2. Find how much the pixel belongs to the shadows, the midtones and the highlights.
3. Shift each channel by the slider values of those ranges, weighted by the masks, and clip.
4. With Preserve luminosity, put the original lightness back.

## Mathematical foundation

--8<-- "filters/color-balance-formula.md"

The three masks are made of ramps of width 0.25 at lightness 0.333 and 0.667. Where they overlap, a pixel takes part of two ranges. Each mask is scaled by 0.7, so a slider at 100 shifts a channel by at most 0.7 of the full range. Preserve luminosity converts the shifted color to HSL, sets its lightness to the input's, and converts back.

## Kernel or operator

The Inspector shows the tone masks, the shift of each channel, and the lightness step when it is on.

## Algorithm

--8<-- "filters/color-balance-steps.md"

## Parameters

--8<-- "filters/color-balance-params.md"

## Implementation

`colorBalanceFilter` in `web/src/core/filters/enhancement/color-adjust.ts` builds the masks with `toneMasks` and uses `rgbToHsl` and `hslToRgb` from `web/src/core/color/convert.ts`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/color-balance.md"

## Complexity

--8<-- "filters/color-balance-complexity.md"

## Artifacts and limitations

--8<-- "filters/color-balance-limits.md"

## Tests

The reference computes the same masks with Python's `colorsys` module for HSL with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels. The cases cover the defaults, strong shifts in all ranges, and both settings of Preserve luminosity.

--8<-- "filters/color-balance-tests.md"

## References

--8<-- "filters/color-balance-references.md"
