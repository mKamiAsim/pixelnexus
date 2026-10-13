# Inverse filtering

--8<-- "filters/inverse-filter-facts.md"

## Overview

Inverse filtering undoes a known blur by dividing the spectrum of the image by the transform of the blur. Without noise it is exact. With noise it fails, because the blur leaves some frequencies almost at 0, and dividing raises their noise hugely. The filter therefore divides only where the blur kept enough of each frequency.

<figure markdown="span">
  ![Three panels: disks smeared by motion, the inverse filter result with sharp disks, and the result for the same blur with a little noise, covered in strong streaks.](../../assets/figures/inverse-filter-light.svg#only-light){ width="480" }
  ![Three panels: disks smeared by motion, the inverse filter result with sharp disks, and the result for the same blur with a little noise, covered in strong streaks.](../../assets/figures/inverse-filter-dark.svg#only-dark){ width="480" }
  <figcaption>The inverse filter undoes the motion blur well, but a little noise, sigma 2, makes it fail.</figcaption>
</figure>

## How it works

1. Take the spectrum G of the blurred image and the transform H of the blur.
2. Divide G by H where |H| reaches the smallest gain and the frequency is within the cutoff.
3. Set the other frequencies to 0.
4. Transform back.

## Mathematical foundation

--8<-- "filters/inverse-filter-formula.md"

A blur multiplies the spectrum of the image by H, so G = H F, and F = G / H. With noise N, G = H F + N, and G / H = F + N / H. Where |H| is small, N / H is huge. Gonzalez and Woods show this and limit the inverse filter to a radius around the center. This filter also skips frequencies where |H| is below the smallest gain. The result is a pseudo-inverse.

## Kernel or operator

The Inspector lists the stages, with the PSF and the current cutoff and smallest gain.

## Algorithm

--8<-- "filters/inverse-filter-steps.md"

## Parameters

--8<-- "filters/inverse-filter-params.md"

## Implementation

`inverseFilter` in `web/src/core/filters/restoration/deconvolve.ts` multiplies the spectrum by the gain of `inverseGain`. As for the frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. H is the FFT of the PSF placed with its center at the origin of the FFT grid. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/inverse-filter.md"

## Complexity

--8<-- "filters/inverse-filter-complexity.md"

## Artifacts and limitations

--8<-- "filters/inverse-filter-limits.md"

## Tests

The reference builds the same PSF kernels, places them at the origin of the grid, takes their FFT with `numpy.fft` and filters the plane extended with `numpy.pad`. Before the cases are written, the script blurs a plane with a Gaussian PSF. It checks that Wiener deconvolution brings the center of the image at least twice as close to the original. The inverse cases cover a Gaussian and a motion PSF with a cutoff and a smallest gain.

--8<-- "filters/inverse-filter-tests.md"

## References

--8<-- "filters/inverse-filter-references.md"
