# Dead-pixel correction

--8<-- "filters/dead-pixel-facts.md"

## Overview

Dead-pixel correction repairs single pixels that are stuck, dead or hot. Such a pixel differs strongly from its neighbors. The filter compares each pixel with the median of its neighbors, without the pixel itself. When any channel is too far off, the whole pixel gets the neighbor medians. All other pixels keep their exact values. A detection view shows which pixels would change.

<figure markdown="span">
  ![Three panels: disks with a few black and white defects, the detection view with white dots at the defects on black, and the repaired image without defects.](../../assets/figures/dead-pixel-light.svg#only-light){ width="480" }
  ![Three panels: disks with a few black and white defects, the detection view with white dots at the defects on black, and the repaired image without defects.](../../assets/figures/dead-pixel-dark.svg#only-dark){ width="480" }
  <figcaption>The detection view shows the defective pixels. The repair changes only those pixels.</figcaption>
</figure>

## How it works

1. Find the median of the neighbors in each channel, without the pixel itself.
2. Find the largest channel difference between the pixel and those medians.
3. If it is above the threshold, replace all channels by the medians. Otherwise keep the pixel.

## Mathematical foundation

--8<-- "filters/dead-pixel-formula.md"

The reference leaves the center out, so a defect cannot pull its own reference. The neighbor count is even, 8 for a 3x3 window, so the median is the mean of the two middle values. Detection uses the largest channel difference, because a defect in one color site of a sensor still spoils the whole pixel after demosaicing.

## Kernel or operator

The Inspector shows the window without its center and the threshold. The Learn panel shows a line profile through the image, and the worked example below repairs one hot pixel.

## Algorithm

--8<-- "filters/dead-pixel-steps.md"

## Parameters

--8<-- "filters/dead-pixel-params.md"

## Implementation

`deadPixelFilter` in `web/src/core/filters/restoration/dead-pixel.ts` sorts the neighbors of each pixel and channel in `neighborMedians`, then applies the rule. With Show set to Detected pixels it writes white where a defect was found and black elsewhere. It is a color filter: the framework in `web/src/core/filters/run.ts` hands it the red, green and blue planes together, with the border mode, and keeps alpha. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/dead-pixel.md"

## Complexity

--8<-- "filters/dead-pixel-complexity.md"

## Artifacts and limitations

--8<-- "filters/dead-pixel-limits.md"

## Tests

The reference takes `numpy.median` of the neighbors of each NumPy window, on a color input with white, black and one-channel defects. Before it is used, the script checks the neighbor median against `scipy.ndimage.generic_filter` with a ring footprint. The test covers both views and two window sizes for all five border modes.

--8<-- "filters/dead-pixel-tests.md"

## References

--8<-- "filters/dead-pixel-references.md"
