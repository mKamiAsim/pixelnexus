# Temperature and tint

--8<-- "filters/temperature-tint-facts.md"

## Overview

Temperature and tint describe the light in the scene the way cameras do. The temperature in kelvin places the light on the blackbody curve, from orange candle light to blue sky. The tint moves it toward green or magenta. The filter removes that light by adapting it to daylight, D65.

<figure markdown="span">
  ![Three panels: the color chart with a strong orange cast, the chart corrected at 2850 K with neutral grays, and corrected at 4500 K with some warmth left.](../../assets/figures/temperature-tint-light.svg#only-light){ width="480" }
  ![Three panels: the color chart with a strong orange cast, the chart corrected at 2850 K with neutral grays, and corrected at 4500 K with some warmth left.](../../assets/figures/temperature-tint-dark.svg#only-dark){ width="480" }
  <figcaption>The chart with a tungsten cast, made by adapting it from D65 to illuminant A, corrected with temperature 2850 K and with 4500 K.</figcaption>
</figure>

## How it works

1. Find the color of a blackbody at the temperature.
2. Move it across the blackbody curve by the tint, in the CIE 1960 uv diagram.
3. Adapt from that white to D65 with the Bradford transform.

## Mathematical foundation

--8<-- "filters/temperature-tint-formula.md"

A blackbody glows with a color set by its temperature alone, and many real lights are close to one. The spline of Kang and colleagues gives its chromaticity from 1667 K to 25000 K. The CIE 1960 uv diagram is used for the tint, because distances there match seen color differences better than in xy. Duv measures the distance off the curve.

## Kernel or operator

The Inspector shows the 3 by 3 matrix in linear sRGB for the current temperature and tint.

## Algorithm

--8<-- "filters/temperature-tint-steps.md"

## Parameters

--8<-- "filters/temperature-tint-params.md"

## Implementation

`temperatureTintFilter` in `web/src/core/filters/enhancement/white-balance.ts` finds the white with `lightWhite` and builds the matrix with `rgbAdaptation`, both from `web/src/core/color/adaptation.ts`.

## Worked example

--8<-- "examples/temperature-tint.md"

## Complexity

--8<-- "filters/temperature-tint-complexity.md"

## Artifacts and limitations

--8<-- "filters/temperature-tint-limits.md"

## Tests

The reference computes the same steps with NumPy on a small RGB test image with saturated, gray, black and white pixels, and compares all three channels. More tests check that the spline at 2856 K lies within 0.001 of the white point of illuminant A. They also check that a positive tint moves the white toward green by the given Duv.

--8<-- "filters/temperature-tint-tests.md"

## References

--8<-- "filters/temperature-tint-references.md"
