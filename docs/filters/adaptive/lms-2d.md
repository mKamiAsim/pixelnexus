# 2D LMS adaptive filter

--8<-- "filters/lms-2d-facts.md"

## Overview

The 2D LMS filter predicts each pixel from the pixels around it, with weights that it learns while it scans the image. It starts with the plain mean of the neighbors. After every pixel it compares its guess with the pixel, and nudges the weights to make the next guess better. This is the least mean squares (LMS) update that Hadhoud and Thomas brought to images.

Noise that the neighbors do not share cannot be predicted, so the prediction is a denoised image. Where the image has a direction, such as stripes, the weights learn to follow it, and the filter beats any fixed average.

<figure markdown="span">
  ![Three panels: the Disks and dots test image with strong noise, the LMS prediction with much less noise and faint horizontal streaks inside the large disks, and the LMS error, gray noise with the disk outlines.](../../assets/figures/lms-2d-light.svg#only-light){ width="480" }
  ![Three panels: the Disks and dots test image with strong noise, the LMS prediction with much less noise and faint horizontal streaks inside the large disks, and the LMS error, gray noise with the disk outlines.](../../assets/figures/lms-2d-dark.svg#only-dark){ width="480" }
  <figcaption>The prediction removes much of the noise. The error is what the neighbors cannot predict: the noise and the outlines.</figcaption>
</figure>

## How it works

1. Guess the pixel from its neighbors with the current weights. At first the guess is their plain mean.
2. Compare the guess with the pixel. The difference is the error.
3. Nudge each weight in the direction that makes the error smaller.
4. Go on to the next pixel, row by row.

## Mathematical foundation

--8<-- "filters/lms-2d-formula.md"

LMS follows the gradient of the squared error, one pixel at a time. The error is d - w x, so the gradient of its square with respect to w is -2 e x. A small step against it lowers the error for pixels like this one. Dividing the step by the energy of x makes the step size independent of how bright the image is.

The center pixel is left out of the window on purpose. With the center in the window, the best weights would copy it, noise and all.

## Kernel or operator

There is no fixed kernel. The weights change at every pixel. The Inspector shows the prediction and the update with the current values.

## Algorithm

--8<-- "filters/lms-2d-steps.md"

## Parameters

--8<-- "filters/lms-2d-params.md"

## Implementation

`lmsPlane` in `web/src/core/filters/adaptive/scan.ts` scans the image in raster order, row by row from the top left. The weights carry over from each pixel to the next, also from the end of one row to the start of the next. Values are scaled to 0 to 1 before the update. The scan cannot be cut into tiles, so the filter runs on the whole image at once.

## Worked example

--8<-- "examples/lms-2d.md"

On the disks, the fixed box filter wins, since the image is flat except at the edges. On the stripes, every fixed average blurs the pattern away, while LMS learns the direction of the stripes and keeps them. Adaptive filters pay off where the image has a structure that a fixed kernel does not fit.

## Complexity

--8<-- "filters/lms-2d-complexity.md"

## Artifacts and limitations

--8<-- "filters/lms-2d-limits.md"

## Tests

A NumPy loop of the same update, in `tools/fixtures_scan.py`, gives the reference for window sizes 3 and 5, both outputs and three border modes. Before it is used, the script checks that a step size of 0 gives the mean of the eight neighbors.

--8<-- "filters/lms-2d-tests.md"

## References

--8<-- "filters/lms-2d-references.md"
