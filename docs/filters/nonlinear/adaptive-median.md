# Adaptive median filter

--8<-- "filters/adaptive-median-facts.md"

## Overview

The adaptive median filter is a median filter that decides, pixel by pixel, how large its window must be and whether the pixel is noise at all. Where the noise is dense, the window grows until its median is a real value. Pixels that are not extreme in their window keep their values. So it removes much denser salt-and-pepper noise than a 3x3 median, with less blur than a large median.

<figure markdown="span">
  ![Four panels in two rows: disks with 30 percent salt-and-pepper noise, a 3x3 median that leaves many specks, a 7x7 median that is clean but blurred, and the adaptive median that is clean and sharp.](../../assets/figures/adaptive-median-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with 30 percent salt-and-pepper noise, a 3x3 median that leaves many specks, a 7x7 median that is clean but blurred, and the adaptive median that is clean and sharp.](../../assets/figures/adaptive-median-dark.svg#only-dark){ width="480" }
  <figcaption>With 30 percent noise, a 3x3 median leaves specks and a 7x7 median blurs. The adaptive median does neither.</figcaption>
</figure>

## How it works

1. Find the min, median and max of the 3x3 window.
2. If the median equals the min or the max, it is an impulse itself. Grow the window by 2 and look again, up to the largest size.
3. If the pixel lies strictly between the min and the max, keep it.
4. Otherwise write the median.

## Mathematical foundation

--8<-- "filters/adaptive-median-formula.md"

Stage A tests the median, stage B tests the pixel. Both use the same test: a value is taken as an impulse when it equals the min or the max of the window. In salt-and-pepper noise, impulses are 0 or 255, so they are always at an end of the sorted window. A real value lies strictly inside the range as long as the window holds some ordinary values. When the largest window is reached without passing stage A, the filter writes the median of that window, as in Gonzalez and Woods.

## Kernel or operator

The Inspector shows the largest window and the rule. The Rank stepper in the Learn panel shows the largest window at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/adaptive-median-steps.md"

## Parameters

--8<-- "filters/adaptive-median-params.md"

## Implementation

`adaptiveMedianFilter` in `web/src/core/filters/nonlinear/adaptive-median.ts` first rounds the values to whole numbers. For each window size it computes the min and max planes with the separable code of the min and max filters, and the median plane with the sliding histogram. Then each pixel walks through the sizes. This costs more memory than growing a window per pixel, but every step is a fast whole-plane pass. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/adaptive-median.md"

## Complexity

--8<-- "filters/adaptive-median-complexity.md"

## Artifacts and limitations

--8<-- "filters/adaptive-median-limits.md"

## Tests

The reference follows the two stages of Gonzalez and Woods with NumPy windows. It runs on an input with salt and pepper pixels, two of them side by side, for largest windows 3, 5 and 7 and all five border modes. Before it is used, the script checks that a plane without impulses passes through unchanged.

--8<-- "filters/adaptive-median-tests.md"

## References

--8<-- "filters/adaptive-median-references.md"
