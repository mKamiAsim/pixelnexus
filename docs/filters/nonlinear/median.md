# Median filter

--8<-- "filters/median-facts.md"

## Overview

The median filter replaces each pixel with the middle value of its window. One very bright or very dark pixel cannot pull the result, because it ends up at the end of the sorted list. This is why it removes salt-and-pepper noise and keeps edges sharp.

<figure markdown="span">
  ![Three panels: a gray ramp with salt-and-pepper noise, the result of a 3x3 median, and the result of a 3x3 box filter.](../../assets/figures/median-light.svg#only-light){ width="480" }
  ![Three panels: a gray ramp with salt-and-pepper noise, the result of a 3x3 median, and the result of a 3x3 box filter.](../../assets/figures/median-dark.svg#only-dark){ width="480" }
  <figcaption>A 3x3 median removes salt-and-pepper noise. A 3x3 box filter smears it.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Sort its values from dark to bright.
3. Pick the value in the middle of the list.
4. Write it as the new pixel value.

## Mathematical foundation

--8<-- "filters/median-formula.md"

The median is an order statistic. It has no kernel and is not a weighted sum, so the filter is nonlinear. The window size is odd, so there is exactly one middle value, and it is always one of the input values. A noise value can only win when more than half of the window is noise.

## Kernel or operator

The Inspector shows the window size, the number of values and the rank of the chosen value. For a 3x3 window that is the 5th of 9 values. The Rank stepper in the Learn panel shows the sorted list at any pixel.

## Algorithm

--8<-- "filters/median-steps.md"

## Parameters

--8<-- "filters/median-params.md"

## Implementation

The median comes from a sliding 256-bin histogram (Huang, Yang and Tang). Moving one pixel to the right removes one column of the window and adds one, so the cost per pixel grows with the window width, not its area. With the brightness scope, luma is rounded to whole values first. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/median.md"

## Complexity

--8<-- "filters/median-complexity.md"

## Artifacts and limitations

--8<-- "filters/median-limits.md"

## Tests

The filter is compared with `scipy.ndimage.median_filter` for window sizes 3, 5 and 7 and all five border modes. The results match exactly.

--8<-- "filters/median-tests.md"

## References

--8<-- "filters/median-references.md"
