# Weighted median filter

--8<-- "filters/weighted-median-facts.md"

## Overview

The weighted median filter is a median in which each window position counts as many times as its weight. A heavier center keeps thin lines and corners that a plain median removes. A weight of 0 leaves a position out, so the weights also set the shape of the window.

<figure markdown="span">
  ![Three panels: a Siemens star with salt-and-pepper noise, a 3x3 median that removes the noise and blurs the thin spokes near the center, and a center-weighted median that keeps more of the spokes.](../../assets/figures/weighted-median-light.svg#only-light){ width="480" }
  ![Three panels: a Siemens star with salt-and-pepper noise, a 3x3 median that removes the noise and blurs the thin spokes near the center, and a center-weighted median that keeps more of the spokes.](../../assets/figures/weighted-median-dark.svg#only-dark){ width="480" }
  <figcaption>A heavier center weight keeps more of the thin spokes near the middle.</figcaption>
</figure>

## How it works

1. Take the window around the pixel.
2. Count each value as often as the weight of its position.
3. Sort this longer list and write its middle value.

## Mathematical foundation

--8<-- "filters/weighted-median-formula.md"

For weights that are whole numbers, the weighted median is the median of the list in which each value is repeated as often as its weight (Brownrigg, 1984). For any weights of 0 or more, it is the value v that minimizes a weighted sum. That sum adds up each weight times the distance from its window value to v. The filter takes the smallest value at which the running weight reaches half of the total. When the total is even, this is the lower of the two middle values. If the center weight is half of the total or more, the center always wins, and the filter changes nothing.

## Kernel or operator

The Inspector shows the weights as a grid and the total weight. The Rank stepper in the Learn panel shows the window at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/weighted-median-steps.md"

## Parameters

--8<-- "filters/weighted-median-params.md"

## Implementation

`weightedMedianPlane` in `web/src/core/filters/nonlinear/weighted-median.ts` adds each weight to the histogram bin of the value under it, then walks the bins from 0 until the running weight reaches half. The weights use the same text format as the weighted average filter. Weights that cannot be read, negative weights or a total of 0 make the filter use the default weights, and the Inspector says so. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/weighted-median.md"

## Complexity

--8<-- "filters/weighted-median-complexity.md"

## Artifacts and limitations

--8<-- "filters/weighted-median-limits.md"

## Tests

The reference sorts each window with NumPy and walks the weights. Before it is used, it is checked twice: with all weights 1 it must equal `scipy.ndimage.median_filter`, and with whole weights it must equal the median of the repeated values. The test covers four weight patterns, including a plus shape, a single row and fractional weights with an even total, for three border modes.

--8<-- "filters/weighted-median-tests.md"

## References

--8<-- "filters/weighted-median-references.md"
