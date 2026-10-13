# Vector median filter

--8<-- "filters/vector-median-facts.md"

## Overview

The vector median filter treats each pixel as one color, a vector of red, green and blue. For each window it picks the color that is closest, in total, to all the other colors of the window. The output is always a color that is in the window. A per-channel median can mix the red of one pixel with the green of another, which makes new colors at color edges. The vector median cannot.

<figure markdown="span">
  ![Three panels: a hue sweep with black and white specks, a per-channel 3x3 median, and a 3x3 vector median. Both medians remove the specks.](../../assets/figures/vector-median-light.svg#only-light){ width="480" }
  ![Three panels: a hue sweep with black and white specks, a per-channel 3x3 median, and a 3x3 vector median. Both medians remove the specks.](../../assets/figures/vector-median-dark.svg#only-dark){ width="480" }
  <figcaption>Both remove the specks. The vector median uses only colors from the window.</figcaption>
</figure>

## How it works

1. Collect the colors of the window.
2. For each color, add up its distances to all the other window colors.
3. Write the color with the smallest total.

## Mathematical foundation

--8<-- "filters/vector-median-formula.md"

For numbers, the median is the value that minimizes the sum of absolute differences to all samples. The vector median of Astola, Haavisto and Neuvo (1990) uses the same idea with vector distances, and keeps the answer among the samples. With the L2 distance it measures straight lines between colors in RGB space, and with L1 it adds up the channel differences. For a gray image, both give the plain median.

## Kernel or operator

There is no kernel. The Inspector shows the window and the rule. The Learn panel shows a line profile, and the worked example below adds up the distances for one window.

## Algorithm

--8<-- "filters/vector-median-steps.md"

## Parameters

--8<-- "filters/vector-median-params.md"

## Implementation

`vectorMedianFilter` in `web/src/core/filters/nonlinear/vector-median.ts` collects the window colors, computes each pairwise distance once and adds it to both sums. On a tie, the first color in reading order wins. The window is limited to 7x7, because the cost grows with the fourth power of the size. It is a color filter: the framework in `web/src/core/filters/run.ts` hands it the red, green and blue planes together, with the border mode, and keeps alpha. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/vector-median.md"

## Complexity

--8<-- "filters/vector-median-complexity.md"

## Artifacts and limitations

--8<-- "filters/vector-median-limits.md"

## Tests

The reference computes all pairwise distances with NumPy on a color input with white, black and one-channel impulses. Before it is used, the script checks that both distances give `scipy.ndimage.median_filter` on a gray image. The test covers 3x3 with both distances and 5x5 with L2, for all five border modes.

--8<-- "filters/vector-median-tests.md"

## References

--8<-- "filters/vector-median-references.md"
