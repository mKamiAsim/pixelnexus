# Wiener deconvolution

--8<-- "filters/wiener-deconv-facts.md"

## Overview

Wiener deconvolution undoes a known blur as far as the noise allows. Where the blur kept a frequency well, it divides by the blur like the inverse filter. Where the blur kept less of a frequency than the noise holds, it turns the frequency down instead. One parameter, the noise to signal ratio K, sets the balance.

<figure markdown="span">
  ![Three panels: disks with motion blur and a little noise, the inverse filter result covered in streaks, and the Wiener result with sharp disks and little noise.](../../assets/figures/wiener-deconv-light.svg#only-light){ width="480" }
  ![Three panels: disks with motion blur and a little noise, the inverse filter result covered in streaks, and the Wiener result with sharp disks and little noise.](../../assets/figures/wiener-deconv-dark.svg#only-dark){ width="480" }
  <figcaption>With the same noise, Wiener deconvolution with K = 0.01 undoes the blur and keeps the noise low.</figcaption>
</figure>

## How it works

1. Take the spectrum G of the blurred image and the transform H of the blur.
2. Multiply each frequency by conj(H) / (|H|^2 + K).
3. Transform back.

## Mathematical foundation

--8<-- "filters/wiener-deconv-formula.md"

The Wiener filter gives the estimate with the least mean squared error for a linear blur with white noise. With S the power of the image and N the power of the noise, it is conj(H) / (|H|^2 + N / S). Gonzalez and Woods replace N / S by a constant K when the spectra are not known. For |H|^2 much larger than K the gain is 1 / H. For |H|^2 much smaller than K it is about conj(H) / K, which goes to 0 with H.

## Kernel or operator

The Inspector lists the stages, with the PSF and the current K.

## Algorithm

--8<-- "filters/wiener-deconv-steps.md"

## Parameters

--8<-- "filters/wiener-deconv-params.md"

## Implementation

`wienerDeconvFilter` in `web/src/core/filters/restoration/deconvolve.ts` multiplies the spectrum by the gain of `wienerGain`. As for the frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. H is the FFT of the PSF placed with its center at the origin of the FFT grid. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/wiener-deconv.md"

## Complexity

--8<-- "filters/wiener-deconv-complexity.md"

## Artifacts and limitations

--8<-- "filters/wiener-deconv-limits.md"

## Tests

The reference builds the same PSF kernels, places them at the origin of the grid, takes their FFT with `numpy.fft` and filters the plane extended with `numpy.pad`. Before the cases are written, the script blurs a plane with a Gaussian PSF. It checks that Wiener deconvolution brings the center of the image at least twice as close to the original. The Wiener cases cover the three PSFs with three values of K.

--8<-- "filters/wiener-deconv-tests.md"

## References

--8<-- "filters/wiener-deconv-references.md"
