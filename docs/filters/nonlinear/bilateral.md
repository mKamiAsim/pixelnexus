# Bilateral filter

--8<-- "filters/bilateral-facts.md"

## Overview

The bilateral filter is a blur that only mixes a pixel with neighbors that look like it. Each neighbor gets two weights: one that falls with its distance, as in a Gaussian blur, and one that falls with its difference in value. Neighbors across an edge are very different, so they get almost no weight, and the edge stays sharp. The color mode measures the difference between whole colors, the vector bilateral filter.

<figure markdown="span">
  ![A plot of one row across a noisy step edge. The Gaussian blur smooths the noise and turns the step into a slope. The bilateral filter smooths the noise and keeps the step.](../../assets/figures/bilateral-light.svg#only-light){ width="480" }
  ![A plot of one row across a noisy step edge. The Gaussian blur smooths the noise and turns the step into a slope. The bilateral filter smooths the noise and keeps the step.](../../assets/figures/bilateral-dark.svg#only-dark){ width="480" }
  <figcaption>The Gaussian blur smooths the noise and the edge. The bilateral filter smooths the noise and keeps the edge.</figcaption>
</figure>

## How it works

1. Give each neighbor a weight that falls with its distance from the pixel.
2. Multiply it by a weight that falls with the difference in value.
3. Write the weighted mean of the neighbors.

## Mathematical foundation

--8<-- "filters/bilateral-formula.md"

The weights depend on the image, so the kernel changes from pixel to pixel and the filter is nonlinear. Differences much larger than the range sigma get a weight near 0. When the range sigma is very large, every value weight is near 1, and the filter becomes a Gaussian blur on a disk. The window is the disk of radius ceil(3 sigma_s), as in OpenCV, where the distance weight has fallen below 1.2 percent.

## Kernel or operator

The Inspector shows the weight formula with the current parameters. The Weight viewer in the Learn panel draws the distance weight, the value weight and their normalized product at any pixel, from the same weight function the filter uses.

## Algorithm

--8<-- "filters/bilateral-steps.md"

## Parameters

--8<-- "filters/bilateral-params.md"

## Implementation

`bilateralPlanes` in `web/src/core/filters/nonlinear/bilateral.ts` visits every neighbor in the disk for every pixel. In the channel mode, each channel has its own value weights. In the color mode, the value weight comes from the RGB distance and is shared. The same function takes a separate guide for the joint bilateral filter. It is a color filter: the framework in `web/src/core/filters/run.ts` hands it the red, green and blue planes together, with the border mode, and keeps alpha. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/bilateral.md"

## Complexity

--8<-- "filters/bilateral-complexity.md"

## Artifacts and limitations

--8<-- "filters/bilateral-limits.md"

## Tests

The reference computes all weights of each NumPy window. Before it is used, the script checks the channel mode against `cv2.bilateralFilter` on an 8-bit image, within 1 level for rounding. The test covers the channel mode and two settings of the color mode on a color input, for all five border modes.

--8<-- "filters/bilateral-tests.md"

## References

--8<-- "filters/bilateral-references.md"
