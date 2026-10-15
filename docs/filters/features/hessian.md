# Hessian-based filter

--8<-- "filters/hessian-facts.md"

## Overview

Ng and coworkers made the hybrid Hessian filter to find wrinkles and fine lines. It is the Frangi vesselness with a fixed structure constant gamma, so the strength of a response does not depend on the rest of the image. Then scikit-image sets every pixel whose response is exactly 0 to 1. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three hybrid Hessian results. In all three, white speckles fill the noisy ground, where the curvature has the wrong sign for a ridge and the response is set to 1. The waves show as lines among the speckles.](../../assets/figures/hessian-light.svg#only-light){ width="480" }
  ![Four panels: four dark waves of growing width and a dark disk on a light ground with fine noise, and three hybrid Hessian results. In all three, white speckles fill the noisy ground, where the curvature has the wrong sign for a ridge and the response is set to 1. The waves show as lines among the speckles.](../../assets/figures/hessian-dark.svg#only-dark){ width="480" }
  <figcaption>Four dark waves 1, 2, 4 and 8 pixels wide and a dark disk, with noise. Then the filter with the defaults, with the scales 1 to 3 only, and with bright ridges.</figcaption>
</figure>

## How it works

1. Blur the image with a Gaussian at each scale, and find the second derivatives.
2. At each pixel, find the eigenvalues of the Hessian, the curvatures along and across.
3. Turn them into the line measure of this filter.
4. Keep the largest measure over the scales.
5. Stretch the result so the strongest response is white.

## Mathematical foundation

--8<-- "filters/hessian-formula.md"

The measure is Frangi's vesselness. R_B = |lambda_1| / lambda_2 compares the two Hessian eigenvalues and removes round blobs. S, the size of the Hessian, removes flat noise. Here gamma is a fixed number in pixel levels per pixel squared, 15 by default, as in scikit-image.

Where the curvature has the wrong sign for the chosen ridge color, scikit-image clips lambda_2 to 1e-10, and the measure becomes exactly 0. The hybrid Hessian filter of scikit-image then sets every such pixel to 1, the largest value the measure can have. Read white areas with care: they are either strong ridges or pixels with the wrong curvature. On the Disks image with dark ridges, the inside of each disk is white, while the dark background stays near 0.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the Hessian with the list of scales, the eigenvalues, the line measure with its constants, and the maximum over the scales.

## Algorithm

--8<-- "filters/hessian-steps.md"

## Parameters

--8<-- "filters/hessian-params.md"

## Implementation

`hessian_filter` in `engine/src/pixelnexus_engine/filters/ridges.py` calls `skimage.filters.hessian` on each plane the scope names, in pixel levels from 0 to 255. Then it stretches the result so the strongest response is 255. The Hessian comes from two passes of a Gaussian derivative of sigma / sqrt(2), so the image is blurred by sigma in all. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/hessian.md"

## Complexity

--8<-- "filters/hessian-complexity.md"

## Artifacts and limitations

--8<-- "filters/hessian-limits.md"

## Tests

The filter must equal `skimage.filters.hessian`, stretched and rounded. Inside a bright disk, looking for dark ridges, the response must be 1 where the Frangi measure is 0, and near 0 on the dark ground. A flat image must come out white. The strongest response must be in the middle of a line. The engine API tests run a job and check the stages of the representation.

--8<-- "filters/hessian-tests.md"

## References

--8<-- "filters/hessian-references.md"
