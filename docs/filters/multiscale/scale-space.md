# Scale-space filtering

--8<-- "filters/scale-space-facts.md"

## Overview

Scale-space filtering looks at the image through Gaussian blurs of many sizes. At each size it measures edges or blobs with derivatives, normalized so that small and large blurs can be compared. At each pixel it keeps the strongest response and the size where it was found. The selected size follows the size of the structure, which is the idea behind scale-invariant detectors such as SIFT.

<figure markdown="span">
  ![Three panels: bright disks of several sizes, the strongest normalized Laplacian response where each disk is a dark spot, and the selected scale map where larger disks have brighter centers.](../../assets/figures/scale-space-light.svg#only-light){ width="480" }
  ![Three panels: bright disks of several sizes, the strongest normalized Laplacian response where each disk is a dark spot, and the selected scale map where larger disks have brighter centers.](../../assets/figures/scale-space-dark.svg#only-dark){ width="480" }
  <figcaption>Scale-space filtering of disks with the normalized Laplacian, sigma 1 to 16 in 9 scales, both outputs stretched to the full range. The bright disks have a negative Laplacian, so they are dark in the response. Larger disks pick larger sigmas.</figcaption>
</figure>

## How it works

1. Choose the measure: gradient magnitude, Laplacian or the determinant of the Hessian.
2. Build a list of sigmas from the smallest to the largest, spaced evenly in log sigma.
3. At each sigma, blur and differentiate the image with Gaussian derivative kernels.
4. Multiply each measure by sigma to the power of its order times gamma.
5. At each pixel, keep the value of largest size and the sigma where it was found.

## Mathematical foundation

--8<-- "filters/scale-space-formula.md"

The scale space of an image is the family of its Gaussian blurs L, with the variance t of the blur as the scale. Blurring makes derivatives weaker, so a fine scale usually wins a plain comparison. Lindeberg multiplies a derivative of order m by t^(m gamma / 2). With gamma 1, a structure made s times larger gives the same normalized responses at scale s^2 t as the original gives at t. So the scale with the strongest response grows with the structure. For a bright disk of radius r, the normalized Laplacian at the center is strongest at sigma = r / sqrt 2, as the worked example shows. Lindeberg detects features as local maxima over space and scale. This filter keeps the strongest scale at every pixel instead, so it gives a value everywhere.

## Kernel or operator

The Inspector shows three stages: the list of sigmas in the stack, the formula of the normalized measure with the current gamma, and the selection rule.

## Algorithm

--8<-- "filters/scale-space-steps.md"

## Parameters

--8<-- "filters/scale-space-params.md"

## Implementation

`scaleSpaceFilter` in `web/src/core/filters/multiscale/scale-space.ts` builds the stack with `scaleStack` and measures each scale with `normalizedMeasure`. The derivative kernels are those of the steerable filter and the Laplacian of Gaussian, cut at 4 sigma, and each runs as two 1D passes. On a smaller preview copy, both sigmas shrink with the copy.

## Worked example

--8<-- "examples/scale-space.md"

## Complexity

--8<-- "filters/scale-space-complexity.md"

## Artifacts and limitations

--8<-- "filters/scale-space-limits.md"

## Tests

The reference computes the derivatives with `scipy.ndimage.gaussian_filter` and its `order` argument. It covers all three measures, both outputs and all five border modes. More tests check the spacing of the stack. They also check that a Gaussian blob of sigma 4 picks sigma 4, and that disks pick r / sqrt 2 to within one step.

--8<-- "filters/scale-space-tests.md"

## References

--8<-- "filters/scale-space-references.md"
