# Apply a known blur

--8<-- "filters/degrade-blur-facts.md"

## Overview

Apply a known blur blurs the image with a Gaussian, motion or defocus point spread function, or PSF. The PSF is the picture a single bright point turns into. Because the blur is known exactly, the deconvolution filters can be tested on the result, with the same blur settings.

<figure markdown="span">
  ![Three panels: disks, the disks smeared along a line at 30 degrees, and the disks softly blurred by a defocus disk.](../../assets/figures/degrade-blur-light.svg#only-light){ width="480" }
  ![Three panels: disks, the disks smeared along a line at 30 degrees, and the disks softly blurred by a defocus disk.](../../assets/figures/degrade-blur-dark.svg#only-dark){ width="480" }
  <figcaption>A known blur: motion of 9 pixels at 30 degrees, and defocus with radius 3.</figcaption>
</figure>

## How it works

1. Choose the blur and its size.
2. The filter builds the PSF kernel.
3. Each pixel becomes the sum of its neighbors weighted by the kernel.

## Mathematical foundation

--8<-- "filters/degrade-blur-formula.md"

A linear, shift-invariant blur is a convolution g = h * f of the image f with the PSF h. The Gaussian PSF is the kernel of the Gaussian filter, cut at 4 sigma here so its tail is kept. The motion PSF is the kernel of the motion blur filter, with weights proportional to the length of the line in each cell. The defocus PSF is the disk kernel of the disk averaging filter. All three are symmetric under a half turn, so convolution and correlation are the same.

## Kernel or operator

The Inspector shows the PSF kernel for the current settings.

## Algorithm

--8<-- "filters/degrade-blur-steps.md"

## Parameters

--8<-- "filters/degrade-blur-params.md"

## Implementation

`degradeBlurFilter` in `web/src/core/filters/restoration/deconvolve.ts` builds the kernel with `psfKernel` and correlates the image with it. It runs through the shared framework in `web/src/core/filters/run.ts`, which handles the border, the channel scope and alpha.

## Worked example

--8<-- "examples/degrade-blur.md"

## Complexity

--8<-- "filters/degrade-blur-complexity.md"

## Artifacts and limitations

--8<-- "filters/degrade-blur-limits.md"

## Tests

The reference uses `scipy.ndimage.correlate` with the same kernels. The cases cover the three blurs with two border modes.

--8<-- "filters/degrade-blur-tests.md"

## References

--8<-- "filters/degrade-blur-references.md"
