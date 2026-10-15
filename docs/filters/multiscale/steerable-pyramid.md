# Steerable pyramid filters

--8<-- "filters/steerable-pyramid-facts.md"

## Overview

The steerable pyramid splits an image into bands by size and by direction. Each level holds the detail of one octave of sizes, split into 2 to 8 directions. A high-pass residual holds the finest grain and a low-pass residual holds the broad shapes. The filter can remove noise by shrinking the small values of every band, or show one band, turned to any angle. Unlike the bands of a wavelet transform, the bands do not alias, and there are more than three directions. The filter runs in the PixelNexus engine on your computer and needs the optional pyrtools package.

<figure markdown="span">
  ![Four panels: white disks on a dark ground with strong grainy noise; the steerable pyramid result, with clean disks, a smooth ground and faint rings around the large disks; wavelet thresholding, with clean disks and a few small specks; and a mid-gray panel where only the upper-left and lower-right edges of each disk are drawn as light and dark bands.](../../assets/figures/steerable-pyramid-light.svg#only-light){ width="480" }
  ![Four panels: white disks on a dark ground with strong grainy noise; the steerable pyramid result, with clean disks, a smooth ground and faint rings around the large disks; wavelet thresholding, with clean disks and a few small specks; and a mid-gray panel where only the upper-left and lower-right edges of each disk are drawn as light and dark bands.](../../assets/figures/steerable-pyramid-dark.svg#only-dark){ width="480" }
  <figcaption>Disks with Gaussian noise of sigma 20, the steerable pyramid with the defaults, and wavelet thresholding. The last panel shows the band of level 2 of the clean disks, steered to lines at 45 degrees. It responds where the edge of a disk runs at 45 degrees.</figcaption>
</figure>

## How it works

1. Extend each channel past its edges, since the pyramid wraps around.
2. Build the pyramid: a high-pass residual, then at each level one band per direction, then a low-pass residual.
3. To remove noise, set the small values of each band to zero. The threshold follows the noise level of that band.
4. To show one band, mix the bands of one level into a band at the chosen angle.
5. Rebuild the image, or show the band around mid gray.

## Mathematical foundation

--8<-- "filters/steerable-pyramid-formula.md"

Simoncelli and Freeman built the steerable pyramid to fix two problems of wavelet transforms. The bands of a decimated wavelet transform alias, so a small shift of the image changes them a lot. And they have only three directions, one of them a mix of two diagonals. The steerable pyramid takes its bands in the frequency domain, from smooth masks that do not overlap past the half band, so each band is free of aliasing. Its angular masks are cos^K of the angle from the band's direction. Freeman and Adelson showed that such a filter is steerable: a copy turned to any angle is a fixed mix of K + 1 copies. So the pyramid stores only K + 1 bands per level and can still give a band at any angle. The price is size. The pyramid holds about 4 (K + 1) / 3 + 2 times as many values as the image. The same bands, in a complex form, are the basis of the texture model of Portilla and Simoncelli.

For removing noise, the filter needs the noise level of each band. A band coefficient is a fixed linear mix of the pixels. For white noise of standard deviation sigma, its standard deviation is sigma times the norm of that mix. The filter measures these norms once by building the pyramid of a single bright pixel, and a test checks them against real noise.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. The first three are the Fourier transform, the radial masks and the angular masks with the value of alpha_K. For removing noise, the noise level, the shrink rule and the rebuild follow. For showing one band, the steering follows. The masks are the ones pyrtools builds. A test compares them with the formula.

## Algorithm

--8<-- "filters/steerable-pyramid-steps.md"

## Parameters

--8<-- "filters/steerable-pyramid-params.md"

## Implementation

`steerable_pyramid` in `engine/src/pixelnexus_engine/filters/steerable.py` runs `denoise_plane` or `band_plane` on each channel the scope names. Both build the pyramid with `SteerablePyramidFreq` of pyrtools. `band_noise` measures the noise level of every band from the pyramid of a single bright pixel. It keeps the result for the next channel. The shrink rules come from wavelet thresholding, and the noise estimate from the curvelet-inspired filter. `steered_band` uses `steer` of pyrtools. Sample k of level j sits on pixel 2^j k. `band_plane` reads the band between samples by linear interpolation. Without pyrtools, the module registers nothing, and the studio shows the filter as not available. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/steerable-pyramid.md"

## Complexity

--8<-- "filters/steerable-pyramid-complexity.md"

## Artifacts and limitations

--8<-- "filters/steerable-pyramid-limits.md"

## Tests

The masks that pyrtools builds are compared with the formula of the Inspector, and the squares of the angular masks must add up to 1. Steering is checked twice. The weights of `steer` must turn the angular masks into the mask at any angle. Steering to the angle of a band must give that band. Stripes must light up the band steered to their angle and vanish from the band at right angles. With a threshold factor of 0, the filter must give the image back to within 2e-5 of the range, for odd sizes and several border modes. The noise level of every band is checked against white noise. Show one band must put sample k of level j on pixel 2^j k. A test without pyrtools checks that the filter is then not registered. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/steerable-pyramid-tests.md"

## References

--8<-- "filters/steerable-pyramid-references.md"
