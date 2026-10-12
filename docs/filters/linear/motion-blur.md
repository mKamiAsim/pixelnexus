# Motion blur

--8<-- "filters/motion-blur-facts.md"

## Overview

Motion blur smears the image along a straight line, as if the camera moved during the exposure. The kernel is the path of one bright point, so the Inspector shows exactly what each point becomes.

<figure markdown="span">
  ![Three panels, each showing one bright point after motion blur of length 21 at 0, 30 and 90 degrees.](../../assets/figures/motion-blur-light.svg#only-light){ width="480" }
  ![Three panels, each showing one bright point after motion blur of length 21 at 0, 30 and 90 degrees.](../../assets/figures/motion-blur-dark.svg#only-dark){ width="480" }
  <figcaption>Motion blur turns one bright point into a streak along the motion.</figcaption>
</figure>

## How it works

1. Draw a short line through the pixel, with the chosen length and angle.
2. Give each neighbor a weight by how much of the line passes through it.
3. Multiply each neighbor by its weight and add the results.
4. Write the sum as the new pixel value.

## Mathematical foundation

--8<-- "filters/motion-blur-formula.md"

A camera that moves at constant speed in a straight line spreads each point of light evenly along that line. The kernel is this spread, the point spread function. PixelNexus computes the weight of each kernel cell as the exact length of the line inside the cell's square, divided by the total length. The clipping uses the method of Liang and Barsky. A line through a cell corner gives that cell no weight.

## Kernel or operator

Two kernels from the filter code: a horizontal line of length 5, and a diagonal line of length 4 at 45 degrees. The diagonal passes through cell corners, so only the three cells on the diagonal get weight.

--8<-- "kernels/motion-blur.md"

## Algorithm

--8<-- "filters/motion-blur-steps.md"

## Parameters

--8<-- "filters/motion-blur-params.md"

## Implementation

`motionKernel` builds the kernel. The filter correlates the image with it and skips zero weights. The support radius is the smallest one that holds the whole line, so a horizontal line of length 9 needs a radius of 4. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/motion-blur.md"

## Complexity

--8<-- "filters/motion-blur-complexity.md"

## Artifacts and limitations

--8<-- "filters/motion-blur-limits.md"

## Tests

The kernel is compared with an independent Python version of the same definition for six lengths and angles. The filter output is compared with `scipy.ndimage.correlate` using that kernel, for five settings and three border modes, within 1e-4 relative to the value.

--8<-- "filters/motion-blur-tests.md"

## References

--8<-- "filters/motion-blur-references.md"
