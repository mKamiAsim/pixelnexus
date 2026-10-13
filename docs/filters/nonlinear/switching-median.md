# Switching median filter

--8<-- "filters/switching-median-facts.md"

## Overview

The switching median filter repairs only the pixels that look like impulses. It compares each pixel with the median of its window. When the difference is above a threshold, the pixel is replaced by the median. Otherwise it keeps its exact value. Thin lines and texture that a median filter would blur stay as they are.

<figure markdown="span">
  ![Three panels: a Siemens star with salt-and-pepper noise, a 3x3 median that removes the noise and blurs the spokes, and the switching median with threshold 40 that removes the noise and keeps the spokes.](../../assets/figures/switching-median-light.svg#only-light){ width="480" }
  ![Three panels: a Siemens star with salt-and-pepper noise, a 3x3 median that removes the noise and blurs the spokes, and the switching median with threshold 40 that removes the noise and keeps the spokes.](../../assets/figures/switching-median-dark.svg#only-dark){ width="480" }
  <figcaption>The switching median repairs the specks and keeps the spokes, because it changes only pixels far from the median.</figcaption>
</figure>

## How it works

1. Find the median of the window around the pixel.
2. Measure how far the pixel is from that median.
3. If it is further than the threshold, write the median. Otherwise keep the pixel.

## Mathematical foundation

--8<-- "filters/switching-median-formula.md"

The filter switches between two outputs, the median and the input, based on an impulse detector. Sun and Neuvo (1994) showed that such switching keeps detail that the median filter destroys, because most pixels are never changed. The detector here is the absolute difference to the median. A threshold of 0 replaces every pixel that differs from its median, which gives the plain median filter.

## Kernel or operator

The Inspector shows the window, the median rank and the threshold. The Rank stepper in the Learn panel shows the sorted window at any pixel and the value the filter gives there.

## Algorithm

--8<-- "filters/switching-median-steps.md"

## Parameters

--8<-- "filters/switching-median-params.md"

## Implementation

`switchingMedianFilter` in `web/src/core/filters/nonlinear/switching-median.ts` computes the median plane with the sliding histogram of the median filter, then applies the rule in `switchValue` to each pixel. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/switching-median.md"

## Complexity

--8<-- "filters/switching-median-complexity.md"

## Artifacts and limitations

--8<-- "filters/switching-median-limits.md"

## Tests

The reference applies the same rule to `scipy.ndimage.median_filter`. Before it is used, the script checks that T = 0 gives the median filter and T = 255 changes nothing. The test covers three window and threshold settings on an input with impulses, for all five border modes.

--8<-- "filters/switching-median-tests.md"

## References

--8<-- "filters/switching-median-references.md"
