# Regularization by Denoising

--8<-- "filters/red-facts.md"

## Overview

Regularization by Denoising, or RED, undoes a known blur with the help of a denoiser. It builds a penalty from the denoiser: an image costs little when the denoiser would leave it almost unchanged. The filter minimizes the data term plus this penalty with simple fixed-point steps. Each step runs the denoiser once and solves one linear system with the FFT. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: blurred disks with fine grain, and three restored versions. Wavelet thresholding and the stationary wavelet give sharp disks with dark halos. Non-local means gives sharp disks on a flat ground with a faint halo.](../../assets/figures/red-light.svg#only-light){ width="480" }
  ![Four panels: blurred disks with fine grain, and three restored versions. Wavelet thresholding and the stationary wavelet give sharp disks with dark halos. Non-local means gives sharp disks on a flat ground with a faint halo.](../../assets/figures/red-dark.svg#only-dark){ width="480" }
  <figcaption>Disks blurred with a Gaussian of sigma 2 and Gaussian noise of sigma 5, and RED with each of the three denoisers and the other defaults.</figcaption>
</figure>

## How it works

1. Extend each channel with the border mode, as the frequency filters do.
2. Start with the photo as the estimate.
3. Run the denoiser on the estimate.
4. Find the image that best matches the photo when blurred and stays close to the denoised estimate. The FFT solves this exactly.
5. Repeat with the new estimate, then crop it to the image.

## Mathematical foundation

--8<-- "filters/red-formula.md"

Plug-and-play methods put a denoiser where a prior would be, but the energy they minimize is never written down. Romano, Elad and Milanfar wrote one. The penalty is lambda / 2 times x^T (x - D(x)), the image times what the denoiser would remove from it. For denoisers that change smoothly and have a symmetric Jacobian, its gradient is lambda (x - D(x)). Setting the gradient of the whole energy to 0 gives a linear system with D(x) on the right side. The fixed-point method holds D(x) at the last estimate and solves the system. Here the system is diagonal in the Fourier domain, so each step is exact. The denoisers here meet the conditions only roughly, so the energy is a guide rather than a guarantee. The tests use a linear denoiser with a symmetric matrix, where the conditions hold, and check that RED reaches the exact minimum.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the PSF, the energy with lambda and the two sigmas, and the fixed-point step.

## Algorithm

--8<-- "filters/red-steps.md"

## Parameters

--8<-- "filters/red-params.md"

## Implementation

`red_filter` in `engine/src/pixelnexus_engine/filters/plugplay.py` runs `red_plane` on each channel the scope names. `red_fixed_point` holds the iteration and takes the denoiser as a function. The denoisers are the same as for plug-and-play restoration. The PSF comes from `engine/src/pixelnexus_engine/psf.py`. By default only luma is restored, since the denoisers are slow. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/red.md"

## Complexity

--8<-- "filters/red-complexity.md"

## Artifacts and limitations

--8<-- "filters/red-limits.md"

## Tests

With a linear denoiser that blurs with a symmetric kernel, the RED energy is quadratic. After 3000 steps, the fixed-point method must reach its exact minimum, computed in the Fourier domain, to within 1e-4. The defaults must improve a blurred, noisy image. The denoisers are tested with plug-and-play restoration. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/red-tests.md"

## References

--8<-- "filters/red-references.md"
