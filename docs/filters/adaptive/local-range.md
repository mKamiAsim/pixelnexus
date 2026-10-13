# Range filter

--8<-- "filters/local-range-facts.md"

## Overview

The range filter maps the difference between the largest and the smallest value in the window around each pixel. It is a quick measure of local contrast. With a flat square window it is the same as the morphological gradient: dilation minus erosion.

<figure markdown="span">
  ![Two panels: the Noise patches test image and its 5x5 range map, black in the clean quadrant and bright in the three noisy quadrants.](../../assets/figures/local-range-light.svg#only-light){ width="480" }
  ![Two panels: the Noise patches test image and its 5x5 range map, black in the clean quadrant and bright in the three noisy quadrants.](../../assets/figures/local-range-dark.svg#only-dark){ width="480" }
  <figcaption>The range reacts to every single noisy pixel, so the noisy quadrants turn bright.</figcaption>
</figure>

## How it works

1. Take the window around the pixel.
2. Find its largest and smallest values.
3. Write the difference.

## Mathematical foundation

--8<-- "filters/local-range-formula.md"

The range is the last order statistic minus the first. One extreme value in the window sets it, so it is much more sensitive to noise than the standard deviation. Its values are in levels, from 0 to 255. The result is a new quantity, not an image, so it goes through the output mapping. With the brightness scope the map is gray.

## Kernel or operator

There is no kernel. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window values at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/local-range-steps.md"

## Parameters

--8<-- "filters/local-range-params.md"

## Implementation

`localRangeFilter` in `web/src/core/filters/adaptive/local-stats.ts` subtracts the min plane from the max plane. Both come from `extremePlane`, the separable code of the min and max filters. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/local-range.md"

## Complexity

--8<-- "filters/local-range-complexity.md"

## Artifacts and limitations

--8<-- "filters/local-range-limits.md"

## Tests

The reference is `scipy.ndimage.maximum_filter` minus `scipy.ndimage.minimum_filter`, for window sizes 3 and 5 and all five border modes.

--8<-- "filters/local-range-tests.md"

## References

--8<-- "filters/local-range-references.md"
