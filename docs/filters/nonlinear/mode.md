# Mode filter

--8<-- "filters/mode-facts.md"

## Overview

The mode filter replaces each pixel with the value that occurs most often in its window. It never makes new values, so it suits images with few distinct values, such as label maps, posterized images and masks. For an image with two values it is a majority vote.

<figure markdown="span">
  ![Three panels: disks with salt-and-pepper noise, the result of a 3x3 mode filter with clean disks and hard edges, and the result of a 3x3 median filter.](../../assets/figures/mode-light.svg#only-light){ width="480" }
  ![Three panels: disks with salt-and-pepper noise, the result of a 3x3 mode filter with clean disks and hard edges, and the result of a 3x3 median filter.](../../assets/figures/mode-dark.svg#only-dark){ width="480" }
  <figcaption>On an image with mostly two gray values, the mode is a majority vote and keeps the edges hard.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Count how often each value occurs.
3. Write the most common value. On a tie, write the smallest of the tied values.

## Mathematical foundation

--8<-- "filters/mode-formula.md"

The mode is the peak of the local histogram. Unlike the mean and the median, it needs no order between the values, so it also works for class labels. On a photo with many distinct values, most values occur once. Then every value ties, and the tie rule picks the smallest, so the filter acts like a min filter. That is why it suits images with few values.

## Kernel or operator

There is no kernel, because the output is not a weighted sum. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/mode-steps.md"

## Parameters

--8<-- "filters/mode-params.md"

## Implementation

`histogramPlane` in `web/src/core/filters/nonlinear/window.ts` keeps a 256-bin histogram of the window as it slides along each row. `histogramMode` scans the 256 bins for the highest count. Values are whole numbers. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/mode.md"

## Complexity

--8<-- "filters/mode-complexity.md"

## Artifacts and limitations

--8<-- "filters/mode-limits.md"

## Tests

The reference counts the values of each window with NumPy, for window sizes 3 and 5 and all five border modes. Before it is used, it is checked against `skimage.filters.rank.modal` away from the image edge, where both see the same pixels. The results match exactly. A unit test checks the tie rule.

--8<-- "filters/mode-tests.md"

## References

--8<-- "filters/mode-references.md"
