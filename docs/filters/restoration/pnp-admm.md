# Plug-and-play restoration

--8<-- "filters/pnp-admm-facts.md"

## Overview

Plug-and-play restoration undoes a known blur with a denoiser of your choice. It splits the work into two steps that take turns. The data step sharpens the image so that its blurred copy matches the photo. The denoiser step removes the noise that the sharpening raised. A third quantity keeps track of how far the two disagree, so they settle on one image. This is ADMM, with the denoiser in the place where an image prior would be. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: blurred disks with fine grain, and three restored versions. Wavelet thresholding gives sharp disks with a few dark specks. The stationary wavelet gives sharp disks with a thin dark halo. Non-local means gives the cleanest disks and the flattest ground.](../../assets/figures/pnp-admm-light.svg#only-light){ width="480" }
  ![Four panels: blurred disks with fine grain, and three restored versions. Wavelet thresholding gives sharp disks with a few dark specks. The stationary wavelet gives sharp disks with a thin dark halo. Non-local means gives the cleanest disks and the flattest ground.](../../assets/figures/pnp-admm-dark.svg#only-dark){ width="480" }
  <figcaption>Disks blurred with a Gaussian of sigma 2 and Gaussian noise of sigma 5, and plug-and-play ADMM with each of the three denoisers and the other defaults.</figcaption>
</figure>

## How it works

1. Extend each channel with the border mode, as the frequency filters do.
2. Start with the photo as the denoised image, and the difference at zero.
3. Data step: find the image that best matches the photo when blurred and stays close to the denoised image minus the difference. The FFT solves this exactly.
4. Denoiser step: denoise the result plus the difference, with sigma = sqrt(lambda / rho).
5. Add the new disagreement to the difference, multiply rho by gamma, and repeat.
6. Crop the last denoised image to the image.

## Mathematical foundation

--8<-- "filters/pnp-admm-formula.md"

Many restoration methods minimize a data term plus a prior, 1/2 ||h * x - g||^2 + lambda phi(x). ADMM, the alternating direction method of multipliers, solves such problems by splitting the image into two copies, one for each term, and forcing them to agree. Each half step is then short. The data half is a linear system that the FFT solves at once. The prior half is a proximal map, and the proximal map of a prior is exactly a denoiser for Gaussian noise of variance lambda / rho. Venkatakrishnan, Bouman and Wohlberg took the last step: use any good denoiser there, even one that comes from no written prior. Chan, Wang and Elgendy showed that the iteration settles when rho grows over time. The parameter gamma sets that growth. The tests check the idea with a denoiser that is the exact proximal map of a quadratic prior. Then ADMM must reach the closed-form Tikhonov answer.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the PSF, the data step, the denoiser step with its sigma, and the dual update with rho and gamma.

## Algorithm

--8<-- "filters/pnp-admm-steps.md"

## Parameters

--8<-- "filters/pnp-admm-params.md"

## Implementation

`pnp_admm_filter` in `engine/src/pixelnexus_engine/filters/plugplay.py` runs `pnp_plane` on each channel the scope names. The `pnp_admm` function holds the iteration and takes the denoiser as a function, so the tests can pass one with a known answer. The `denoise` function calls the wavelet thresholding or stationary wavelet code of the engine with a given sigma. For non-local means, it calls `denoise_nl_means` of scikit-image. The PSF comes from `engine/src/pixelnexus_engine/psf.py`. By default only luma is restored, since the denoisers are slow. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/pnp-admm.md"

## Complexity

--8<-- "filters/pnp-admm-complexity.md"

## Artifacts and limitations

--8<-- "filters/pnp-admm-limits.md"

## Tests

With the exact proximal map of a quadratic prior as the denoiser, ADMM must reach the Tikhonov answer to within 1e-6. The denoiser must receive sigma = sqrt(lambda / rho) with rho growing by gamma. The data step must solve its linear system. The denoisers must equal the engine wavelet filters with the given sigma and `denoise_nl_means` with the stated settings. The defaults must improve a blurred, noisy image. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/pnp-admm-tests.md"

## References

--8<-- "filters/pnp-admm-references.md"
