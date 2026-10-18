# Meijering filter

--8<-- "filters/meijering-facts.md"

## Overview

The Meijering filter finds faint, thin lines such as neurites. It mixes each curvature of the brightness with a third of the other and keeps the larger in size. This favors long, flat lines. Each scale is divided by its own largest value, and the filter keeps the strongest answer over the scales. It runs in the PixelNexus engine on your computer, with scikit-image.

<figure markdown="span">
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three Meijering results on black. The waves and the disk are bright with soft halos. With scales 1 to 3, the halos are narrower. With bright ridges, broad gray halos and lines along the edges of the waves show, and the disk becomes a ring.](../../assets/figures/meijering-light.svg#only-light){ width="480" }
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three Meijering results on black. The waves and the disk are bright with soft halos. With scales 1 to 3, the halos are narrower. With bright ridges, broad gray halos and lines along the edges of the waves show, and the disk becomes a ring.](../../assets/figures/meijering-dark.svg#only-dark){ width="480" }
  <figcaption>Four dark waves 1, 2, 4 and 8 pixels wide and a dark disk, with noise. Then the filter with the defaults, with the scales 1 to 3 only, and with bright ridges.</figcaption>
</figure>

## How it works

1. Blur the image with a Gaussian at each scale, and find the second derivatives.
2. At each pixel, find the eigenvalues of the Hessian, the curvatures along and across.
3. Turn them into the line measure of this filter.
4. Keep the largest measure over the scales.
5. Stretch the result so the strongest response is white.

## Mathematical foundation

--8<-- "filters/meijering-formula.md"

The Hessian is the matrix of the second derivatives of the image, after a Gaussian blur of sigma. Meijering et al. mix the two eigenvalues: each one gets alpha times the other added, with alpha = 1/3 in scikit-image. Of the two mixed values, the larger in size is kept. Negative values are set to 0, since they belong to the wrong ridge color.

The mixing changes the shape of the response across a line, so the response stays high over the whole width of a flat line. Each scale is then divided by its largest value over the image, so every scale reaches 1. This makes faint thin lines stand out next to strong ones, but one strong feature also sets the scale for all others.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the Hessian with the list of scales, the eigenvalues, the line measure with its constants, and the maximum over the scales.

## Algorithm

--8<-- "filters/meijering-steps.md"

## Parameters

--8<-- "filters/meijering-params.md"

## Implementation

`meijering_filter` in `engine/src/pixelnexus_engine/filters/ridges.py` calls `skimage.filters.meijering` on each plane the scope names, in pixel levels from 0 to 255. Then it stretches the result so the strongest response is 255. The Hessian comes from two passes of a Gaussian derivative of sigma / sqrt(2), so the image is blurred by sigma in all. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/meijering.md"

## Complexity

--8<-- "filters/meijering-complexity.md"

## Artifacts and limitations

--8<-- "filters/meijering-limits.md"

## Tests

The filter must equal `skimage.filters.meijering`, stretched and rounded. With the RGB scope, each channel must be filtered on its own and alpha kept. The strongest response must be in the middle of a line, and bright ridges of a negated image must equal dark ridges of the image. The engine API tests run a job and check the stages of the representation.

--8<-- "filters/meijering-tests.md"

## References

--8<-- "filters/meijering-references.md"
