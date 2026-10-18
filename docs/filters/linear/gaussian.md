# Gaussian filter

--8<-- "filters/gaussian-facts.md"

## Overview

The Gaussian filter blurs with weights that follow a bell-shaped curve. Close neighbors count more than far ones, so the blur looks smooth and round. It is the standard way to reduce Gaussian noise and to prepare an image for edge detection.

<figure markdown="span">
  ![A line plot of brightness across a sharp edge, before blurring and after Gaussian blurs with sigma 1, 2 and 4.](../../assets/figures/gaussian-light.svg#only-light){ width="480" }
  ![A line plot of brightness across a sharp edge, before blurring and after Gaussian blurs with sigma 1, 2 and 4.](../../assets/figures/gaussian-dark.svg#only-dark){ width="480" }
  <figcaption>A larger sigma spreads a sharp edge over more pixels.</figcaption>
</figure>

## How it works

1. Take the window around the pixel. Its radius is about three times sigma.
2. Give each neighbor a weight from a bell-shaped curve. Close neighbors get more weight.
3. Multiply each neighbor by its weight and add the results.
4. Write the sum as the new pixel value. The weights add up to 1, so flat areas keep their brightness.

## Mathematical foundation

--8<-- "filters/gaussian-formula.md"

The 2D Gaussian is the product of a Gaussian along x and a Gaussian along y. That is why the filter can run as two 1D passes. The weights are samples of the curve at whole pixel offsets, divided by their sum. This normalization makes the discrete weights add up to exactly 1. The window stops at the radius r, which cuts off the far tails of the curve.

## Kernel or operator

The 1D kernel for sigma 1, and the center of the 2D kernel made from it. The studio's Inspector shows the full matrix for the current sigma.

--8<-- "kernels/gaussian.md"

## Algorithm

--8<-- "filters/gaussian-steps.md"

## Parameters

--8<-- "filters/gaussian-params.md"

## Implementation

The kernel comes from `gaussianKernel1d`. The same function feeds the Inspector, so the shown matrix is the one that runs. The radius is floor(truncate times sigma plus 0.5), the rule SciPy uses. With Linear light on, values are decoded from sRGB before the blur and encoded again after it. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/gaussian.md"

## Complexity

--8<-- "filters/gaussian-complexity.md"

## Artifacts and limitations

--8<-- "filters/gaussian-limits.md"

## Tests

The 1D kernel is compared with SciPy for five sigma and truncate pairs within 1e-12. The full filter is compared with `scipy.ndimage.gaussian_filter` for three settings and all five border modes, within 1e-4 relative to the value. A test also checks that the Inspector kernel gives the same output as the filter.

--8<-- "filters/gaussian-tests.md"

## References

--8<-- "filters/gaussian-references.md"
