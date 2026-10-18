# Frangi vesselness

--8<-- "filters/frangi-facts.md"

## Overview

The Frangi filter finds lines and vessels from how the brightness bends. In the middle of a dark line, the brightness bends up strongly across the line and hardly at all along it. Frangi's vesselness measure is large exactly there, and small for round blobs and flat noise. The filter tries several scales and keeps the strongest answer. It runs in the PixelNexus engine on your computer, with scikit-image.

<figure markdown="span">
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three Frangi results on black. With the defaults, the thin waves are bright, the widest wave shows only as two faint lines along its edges, and the disk is a faint ring. With scales 1 to 3, the result is almost the same. With bright ridges, thin lines along the edges of the waves show.](../../assets/figures/frangi-light.svg#only-light){ width="480" }
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three Frangi results on black. With the defaults, the thin waves are bright, the widest wave shows only as two faint lines along its edges, and the disk is a faint ring. With scales 1 to 3, the result is almost the same. With bright ridges, thin lines along the edges of the waves show.](../../assets/figures/frangi-dark.svg#only-dark){ width="480" }
  <figcaption>Four dark waves 1, 2, 4 and 8 pixels wide and a dark disk, with noise. Then the filter with the defaults, with the scales 1 to 3 only, and with bright ridges.</figcaption>
</figure>

## How it works

1. Blur the image with a Gaussian at each scale, and find the second derivatives.
2. At each pixel, find the eigenvalues of the Hessian, the curvatures along and across.
3. Turn them into the line measure of this filter.
4. Keep the largest measure over the scales.
5. Stretch the result so the strongest response is white.

## Mathematical foundation

--8<-- "filters/frangi-formula.md"

The Hessian is the matrix of the second derivatives of the image, after a Gaussian blur of sigma. Its two eigenvalues are the curvatures along and across the direction where the brightness bends most. Sort them so that the first is the smaller in size. Across a dark line, lambda_2 is large and positive. Along it, lambda_1 is near 0.

Frangi et al. built the measure from two ratios. R_B compares the two curvatures. It is near 1 for round blobs, so the first factor removes them. S is the size of the Hessian, which is small in flat, noisy areas, so the second factor removes them. Beta and gamma set how strict each test is. In scikit-image, gamma is half of the largest S at each scale unless you set it. Where lambda_2 has the wrong sign for the ridge color, scikit-image clips it to 1e-10, so the measure is 0. The paper's third factor, for flat plates, only matters in 3D.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the Hessian with the list of scales, the eigenvalues, the line measure with its constants, and the maximum over the scales.

## Algorithm

--8<-- "filters/frangi-steps.md"

## Parameters

--8<-- "filters/frangi-params.md"

## Implementation

`frangi_filter` in `engine/src/pixelnexus_engine/filters/ridges.py` calls `skimage.filters.frangi` on each plane the scope names, in pixel levels from 0 to 255, with the scales, the ridge color and the border mode. Then it stretches the result so the strongest response is 255. A Gamma of 0 passes None, so scikit-image picks gamma at each scale. The Hessian comes from two passes of a Gaussian derivative of sigma / sqrt(2), so the image is blurred by sigma in all. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/frangi.md"

## Complexity

--8<-- "filters/frangi-complexity.md"

## Artifacts and limitations

--8<-- "filters/frangi-limits.md"

## Tests

The filter must equal `skimage.filters.frangi` with the same scales, ridge color and constants, stretched and rounded. The strongest response must be in the middle of a line. Bright ridges of a negated image must give the same result as dark ridges of the image. A round blob must respond less than a twentieth of a line. The engine API tests run a job and check the stages of the representation.

--8<-- "filters/frangi-tests.md"

## References

--8<-- "filters/frangi-references.md"
