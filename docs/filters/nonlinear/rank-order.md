# Rank-order filter

--8<-- "filters/rank-order-facts.md"

## Overview

The rank-order filter sorts each window and keeps the value at a chosen position. You give the position as a rank, from 1 to the number of values, or as a percentile from 0 to 100. Rank 1 is the min filter, the middle rank is the median and the last rank is the max filter.

<figure markdown="span">
  ![Three panels of disks with salt-and-pepper noise after a 3x3 rank-order filter: rank 1 is dark with shrunken disks, rank 5 is clean, rank 9 is bright with grown disks.](../../assets/figures/rank-order-light.svg#only-light){ width="480" }
  ![Three panels of disks with salt-and-pepper noise after a 3x3 rank-order filter: rank 1 is dark with shrunken disks, rank 5 is clean, rank 9 is bright with grown disks.](../../assets/figures/rank-order-dark.svg#only-dark){ width="480" }
  <figcaption>Low ranks darken and shrink bright shapes. High ranks brighten and grow them.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Sort its values from dark to bright.
3. Keep the value at the chosen rank.

## Mathematical foundation

--8<-- "filters/rank-order-formula.md"

The k-th order statistic of the window is a nonlinear filter. It commutes with any increasing change of the values, such as a gamma curve, apart from rounding. A percentile p picks the 0-based position floor(n p / 100), and p = 100 picks the last value. This is the rule of `scipy.ndimage.percentile_filter`.

## Kernel or operator

The Inspector shows the window, the number of values and the rank that is used. The Rank stepper in the Learn panel shows the sorted window at any pixel and the value the filter gives there.

## Algorithm

--8<-- "filters/rank-order-steps.md"

## Parameters

--8<-- "filters/rank-order-params.md"

## Implementation

`rankPlane` in `web/src/core/filters/nonlinear/window.ts` keeps a 256-bin histogram of the window as it slides along each row (Huang, Yang and Tang). A pointer marks the value that holds rank k, and it moves only as far as the window changes. The median filter uses the same code. Values are whole numbers. With the brightness scope, luma is rounded first. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/rank-order.md"

## Complexity

--8<-- "filters/rank-order-complexity.md"

## Artifacts and limitations

--8<-- "filters/rank-order-limits.md"

## Tests

The filter is compared with `scipy.ndimage.rank_filter` and `scipy.ndimage.percentile_filter` for several ranks and percentiles with window sizes 3 and 5 and all five border modes. The results match exactly. Unit tests check the percentile rule and that large ranks are lowered to the last one.

--8<-- "filters/rank-order-tests.md"

## References

--8<-- "filters/rank-order-references.md"
