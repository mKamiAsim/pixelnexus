# Total variation restoration

--8<-- "filters/tv-deblur-facts.md"

## Overview

Total variation restoration undoes a known blur. It looks for the sharp image whose blurred copy matches the photo. Among all such images, it prefers the one with the least total variation, the sum of the gradient length. That keeps flat areas flat and edges sharp, so noise does not grow the way it does with plain deconvolution. The filter minimizes this energy with the primal-dual algorithm of Chambolle and Pock. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: blurred disks with fine grain; total variation with lambda 0.3, sharper disks with some grain left; lambda 3, sharp disks on a clean flat ground; and lambda 30, flat disks whose smallest one has faded.](../../assets/figures/tv-deblur-light.svg#only-light){ width="480" }
  ![Four panels: blurred disks with fine grain; total variation with lambda 0.3, sharper disks with some grain left; lambda 3, sharp disks on a clean flat ground; and lambda 30, flat disks whose smallest one has faded.](../../assets/figures/tv-deblur-dark.svg#only-dark){ width="480" }
  <figcaption>Disks blurred with a Gaussian of sigma 2 and Gaussian noise of sigma 5, and total variation restoration with lambda 0.3, 3 and 30, each with 100 iterations.</figcaption>
</figure>

## How it works

1. Extend each channel with the border mode, as the frequency filters do.
2. Start with the blurred photo as the estimate, and a dual field of zero vectors.
3. Move the dual field along the gradient of the estimate, and pull each vector back to length lambda at most.
4. Move the estimate along the divergence of the dual field, then solve the data term exactly with the FFT.
5. Repeat, then crop the estimate to the image.

## Mathematical foundation

--8<-- "filters/tv-deblur-formula.md"

Deconvolution is unstable. The blur removes fine detail almost completely, so many sharp images fit the same photo, and dividing by the blur in the frequency domain blows up the noise. A penalty picks one answer. Rudin, Osher and Fatemi chose total variation to remove noise, because it favors flat areas with sharp steps. A step and a slow ramp of the same height cost the same, so edges are not smeared. Total variation has no gradient where the image is flat, so plain gradient descent does not work. Chambolle and Pock wrote the problem as a saddle point. The dual field p, one vector per pixel, stays in a disk of radius lambda, and each step updates p and f in turn. Here the data term has an exact solution in the Fourier domain, so every step is cheap.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the PSF, the energy with the value of lambda, the dual step and the primal step.

## Algorithm

--8<-- "filters/tv-deblur-steps.md"

## Parameters

--8<-- "filters/tv-deblur-params.md"

## Implementation

`tv_deblur` in `engine/src/pixelnexus_engine/filters/restoration.py` runs `tv_deblur_plane` on each channel the scope names. The PSF comes from `engine/src/pixelnexus_engine/psf.py`, which builds the same Gaussian, motion and defocus kernels as the browser deconvolution filters. `tv_deconvolve` holds the iteration, with `gradient` and `divergence` written with `numpy.roll`. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/tv-deblur.md"

## Complexity

--8<-- "filters/tv-deblur-complexity.md"

## Artifacts and limitations

--8<-- "filters/tv-deblur-limits.md"

## Tests

The engine PSFs are compared with the fixture references that the browser tests also use, and the extended grid with the grid of the browser frequency filters. The divergence must be the negative adjoint of the gradient. On a small image, 3000 iterations must reach the minimum energy that L-BFGS finds on a slightly smoothed version of the same energy, to within 0.1 percent. With lambda 0, each step must be the exact proximal step of the data term. A blurred noisy image must gain at least 2.5 dB. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/tv-deblur-tests.md"

## References

--8<-- "filters/tv-deblur-references.md"
