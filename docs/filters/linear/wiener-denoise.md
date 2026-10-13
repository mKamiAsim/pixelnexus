# Wiener filter (global)

--8<-- "filters/wiener-denoise-facts.md"

## Overview

The global Wiener filter removes white noise in the frequency domain. At each frequency it estimates how much of the power is noise and turns the frequency down by that share. It needs the noise level. The adaptive Wiener filter is the local version, which uses statistics of a window instead.

<figure markdown="span">
  ![Three panels: disks with strong gray noise, the Wiener result with most of the noise gone, and the clean disks.](../../assets/figures/wiener-denoise-light.svg#only-light){ width="480" }
  ![Three panels: disks with strong gray noise, the Wiener result with most of the noise gone, and the clean disks.](../../assets/figures/wiener-denoise-dark.svg#only-dark){ width="480" }
  <figcaption>The global Wiener filter with sigma 20 removes most of Gaussian noise of sigma 20.</figcaption>
</figure>

## How it works

1. Transform the image with the FFT and measure the power at each frequency.
2. Average the power over the 5 x 5 nearest frequencies.
3. Keep each frequency in proportion 1 - sigma^2 / P, and remove it where P is not above the noise power.
4. Transform back.

## Mathematical foundation

--8<-- "filters/wiener-denoise-formula.md"

For an image with added white noise, the Wiener filter with the least mean squared error is H = S / (S + sigma^2). S is the power of the clean image at each frequency. White noise adds sigma^2 at every frequency, so the power of the noisy image is about P = S + sigma^2. Estimating S as P - sigma^2 gives H = 1 - sigma^2 / P. A single frequency is a poor estimate of P, so the filter averages the power over 5 x 5 frequencies. This estimate is the filter's own. The Wiener filter follows Gonzalez and Woods, and is the frequency-domain filter of Lim.

## Kernel or operator

The gain depends on the image, so the Inspector lists the stages. The Frequency explorer shows the gain on the patch.

## Algorithm

--8<-- "filters/wiener-denoise-steps.md"

## Parameters

--8<-- "filters/wiener-denoise-params.md"

## Implementation

`wienerDenoiseFilter` in `web/src/core/filters/frequency/shaping.ts` computes the gains with `wienerValues`. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/wiener-denoise.md"

## Complexity

--8<-- "filters/wiener-denoise-complexity.md"

## Artifacts and limitations

--8<-- "filters/wiener-denoise-limits.md"

## Tests

The reference extends the plane with `numpy.pad`, filters it with `numpy.fft` and crops it. The power average uses `scipy.ndimage.uniform_filter` with the wrap mode. Before the cases are written, the script checks that sigma 0 keeps the image.

--8<-- "filters/wiener-denoise-tests.md"

## References

--8<-- "filters/wiener-denoise-references.md"
