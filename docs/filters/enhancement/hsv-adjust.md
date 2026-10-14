# Hue, saturation and value adjustment

--8<-- "filters/hsv-adjust-facts.md"

## Overview

This filter changes colors in the HSV model of Smith. It turns the hue by an angle, and scales the saturation and the value. These three controls match how people describe color: which color, how strong and how bright.

<figure markdown="span">
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart with hues turned by 90 degrees, and the chart with weak colors and brighter values.](../../assets/figures/hsv-adjust-light.svg#only-light){ width="480" }
  ![Three panels: a color chart with hue changing from left to right and brightness falling from top to bottom, above a gray ramp, the chart with hues turned by 90 degrees, and the chart with weak colors and brighter values.](../../assets/figures/hsv-adjust-dark.svg#only-dark){ width="480" }
  <figcaption>HSV adjustment: a hue shift of 90 degrees, and saturation 40 percent with value 120 percent.</figcaption>
</figure>

## How it works

1. Convert each pixel to hue, saturation and value.
2. Add the hue shift, and scale the saturation and the value, capped at 1.
3. Convert back to red, green and blue.

## Mathematical foundation

--8<-- "filters/hsv-adjust-formula.md"

In the hexcone model, V is the largest channel, S = (max - min) / max, and H is the position around a hexagon of the six primary and secondary colors. A hue shift moves a color around the hexagon at the same S and V. Unlike hue rotation, it turns the HSV hue by exactly the angle, but it does not keep the gray value.

## Kernel or operator

The Inspector shows the three steps with the current shift and factors.

## Algorithm

--8<-- "filters/hsv-adjust-steps.md"

## Parameters

--8<-- "filters/hsv-adjust-params.md"

## Implementation

`hsvAdjustFilter` in `web/src/core/filters/enhancement/color-adjust.ts` uses `rgbToHsv` and `hsvToRgb` from `web/src/core/color/convert.ts`. It is a pixel filter: the runner calls it once per pixel with the red, green and blue values, and rounds and clips the results at the end.

## Worked example

--8<-- "examples/hsv-adjust.md"

## Complexity

--8<-- "filters/hsv-adjust-complexity.md"

## Artifacts and limitations

--8<-- "filters/hsv-adjust-limits.md"

## Tests

The reference computes the same steps with Python's `colorsys` module, an independent HSV code with NumPy on a small RGB test image with saturated, gray, black and white pixels. Each case compares all three channels.

--8<-- "filters/hsv-adjust-tests.md"

## References

--8<-- "filters/hsv-adjust-references.md"
