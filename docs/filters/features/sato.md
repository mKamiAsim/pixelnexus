# Sato filter

--8<-- "filters/sato-facts.md"

## Overview

The Sato filter finds tube-like lines. At each scale, it takes the larger curvature of the brightness, which is large across a dark line. It multiplies that by sigma squared, so that thin and wide lines are compared fairly. It keeps the strongest answer over the scales. The filter runs in the PixelNexus engine on your computer, with scikit-image.

<figure markdown="span">
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three Sato results on black. All four waves and the disk are bright with the defaults. With scales 1 to 3, the waves are bright with a sharper core. With bright ridges, broad gray halos and lines along the edges of the waves show, and the disk becomes a ring.](../../assets/figures/sato-light.svg#only-light){ width="480" }
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three Sato results on black. All four waves and the disk are bright with the defaults. With scales 1 to 3, the waves are bright with a sharper core. With bright ridges, broad gray halos and lines along the edges of the waves show, and the disk becomes a ring.](../../assets/figures/sato-dark.svg#only-dark){ width="480" }
  <figcaption>Four dark waves 1, 2, 4 and 8 pixels wide and a dark disk, with noise. Then the filter with the defaults, with the scales 1 to 3 only, and with bright ridges.</figcaption>
</figure>

## How it works

1. Blur the image with a Gaussian at each scale, and find the second derivatives.
2. At each pixel, find the eigenvalues of the Hessian, the curvatures along and across.
3. Turn them into the line measure of this filter.
4. Keep the largest measure over the scales.
5. Stretch the result so the strongest response is white.

## Mathematical foundation

--8<-- "filters/sato-formula.md"

The Hessian is the matrix of the second derivatives of the image, after a Gaussian blur of sigma. Across a dark line, the brightness bends up, so the larger eigenvalue lambda_max is positive. Sato et al. use it as the line measure in 2D, clipped at 0.

Second derivatives get smaller as the blur grows. A line of width w and contrast C gives a curvature of about C / sigma^2 at its best scale. The factor sigma^2 cancels this, so lines of the same contrast give about the same value at their own best scale. This is the scale normalization of scale-space theory. The measure ignores the smaller eigenvalue, so dark blobs respond as strongly as lines.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the Hessian with the list of scales, the eigenvalues, the line measure with its constants, and the maximum over the scales.

## Algorithm

--8<-- "filters/sato-steps.md"

## Parameters

--8<-- "filters/sato-params.md"

## Implementation

`sato_filter` in `engine/src/pixelnexus_engine/filters/ridges.py` calls `skimage.filters.sato` on each plane the scope names, in pixel levels from 0 to 255. Then it stretches the result so the strongest response is 255. The Hessian comes from two passes of a Gaussian derivative of sigma / sqrt(2), so the image is blurred by sigma in all. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/sato.md"

## Complexity

--8<-- "filters/sato-complexity.md"

## Artifacts and limitations

--8<-- "filters/sato-limits.md"

## Tests

The filter must equal `skimage.filters.sato`, stretched and rounded, with every border mode reaching scikit-image. Lines 3 and 10 pixels wide with the same contrast must give peaks within 20 percent of each other. A round blob must respond. The engine API tests run a job and check the stages of the representation.

--8<-- "filters/sato-tests.md"

## References

--8<-- "filters/sato-references.md"
