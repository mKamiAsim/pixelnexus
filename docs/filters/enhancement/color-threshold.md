# Color threshold

--8<-- "filters/color-threshold-facts.md"

## Overview

The color threshold makes a black and white mask of the pixels whose color falls in chosen ranges of hue, saturation and value. Hue names the color, such as red or green. Saturation says how strong it is, and value how bright. A range of hues picks one color, and the other two ranges leave out pixels too pale or too dark to have a clear color.

<figure markdown="span">
  ![Three panels: a hue sweep with all hues from left to right, strong at the top and fading to white at the bottom, a mask with white bands at both ends of the top part for red, and a mask with one white band in the top part for green.](../../assets/figures/color-threshold-light.svg#only-light){ width="560" }
  ![Three panels: a hue sweep with all hues from left to right, strong at the top and fading to white at the bottom, a mask with white bands at both ends of the top part for red, and a mask with one white band in the top part for green.](../../assets/figures/color-threshold-dark.svg#only-dark){ width="560" }
  <figcaption>The hue sweep, with hue across and saturation falling downward, and the masks for the red range and for the green range.</figcaption>
</figure>

## How it works

1. Convert each pixel to hue, saturation and value.
2. Check each of the three against its range.
3. Make the pixel white if all three pass, and black otherwise.

## Mathematical foundation

--8<-- "filters/color-threshold-formula.md"

Hue is an angle, so red sits at both 0 and 360 degrees. A range from 330 to 30 degrees therefore wraps: it holds the hues of at least 330 and those of at most 30. Shading changes the value of a surface much more than its hue, which is why a hue range can select an object in light and in shade alike.

## Kernel or operator

The Inspector shows the conversion and the three range tests with the current settings.

## Algorithm

--8<-- "filters/color-threshold-steps.md"

## Parameters

--8<-- "filters/color-threshold-params.md"

## Implementation

`colorThresholdFilter` in `web/src/core/filters/enhancement/color-threshold.ts` converts with `rgbToHsv` and tests with `insideRanges`. It is a pixel filter, so each pixel is handled on its own.

## Worked example

--8<-- "examples/color-threshold.md"

## Complexity

--8<-- "filters/color-threshold-complexity.md"

## Artifacts and limitations

--8<-- "filters/color-threshold-limits.md"

## Tests

The fixture cases compare every pixel of the color test image with a reference from Python's colorsys. They cover a range that wraps and one that does not, with and without Invert. No value lies on a bound, except exact values such as a saturation of 1, so rounding cannot move a pixel across one. Unit tests check the hue wrap and a red and a green pixel.

--8<-- "filters/color-threshold-tests.md"

## References

--8<-- "filters/color-threshold-references.md"
