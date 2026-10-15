# Cartoon effect

--8<-- "filters/cartoon-facts.md"

## Overview

The cartoon effect flattens colors and draws black lines along the edges. The flattening comes from repeated bilateral filtering, which smooths within regions but not across edges. The lines come from an adaptive threshold of the median filtered luma.

<figure markdown="span">
  ![Two panels: a test scene with a blue sky, green ground and red, yellow and blue disks, and the cartoon version with smooth colors and thick black outlines around the disks and along the horizon.](../../assets/figures/cartoon-light.svg#only-light){ width="480" }
  ![Two panels: a test scene with a blue sky, green ground and red, yellow and blue disks, and the cartoon version with smooth colors and thick black outlines around the disks and along the horizon.](../../assets/figures/cartoon-dark.svg#only-dark){ width="480" }
  <figcaption>A test scene, and the cartoon effect with the default settings.</figcaption>
</figure>

## How it works

1. Smooth the colors with the bilateral filter in color mode, once per pass.
2. Round the luma to whole levels and take its 5 by 5 median.
3. Mark the pixels that are darker than their local mean by more than the threshold.
4. Paint the marked pixels black and the rest with the smoothed colors.

## Mathematical foundation

--8<-- "filters/cartoon-formula.md"

Each bilateral pass averages a pixel with neighbors of similar color, so repeated passes flatten regions while edges stay. The median removes noise and fine texture before the lines are found. The lines are the dark side of each edge, where a pixel is darker than its neighborhood.

## Kernel or operator

The Inspector shows the steps of the effect as formulas with the current settings.

## Algorithm

--8<-- "filters/cartoon-steps.md"

## Parameters

--8<-- "filters/cartoon-params.md"

## Implementation

`cartoonFilter` in `web/src/core/filters/artistic/painterly.ts` uses `bilateralPlanes` from the bilateral filter, `medianPlane`, `boxMean` and `cartoonLines`.

## Worked example

--8<-- "examples/cartoon.md"

## Complexity

--8<-- "filters/cartoon-complexity.md"

## Artifacts and limitations

--8<-- "filters/cartoon-limits.md"

## Tests

The reference writes the recipe, with the bilateral reference of the bilateral filter again with NumPy and SciPy, and compares every output value on the test images of the fixtures. A first version of the reference took the median of unrounded luma and missed one pixel, which showed that the median filter works on whole levels. The rule now says so.

--8<-- "filters/cartoon-tests.md"

## References

--8<-- "filters/cartoon-references.md"
