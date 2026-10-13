# Butterworth low-pass filter

--8<-- "filters/butterworth-lowpass-facts.md"

## Overview

The Butterworth low-pass filter keeps the low frequencies of the image, the slow changes in brightness, and removes the high ones. The result is a blurred image. The Butterworth filter changes smoothly from keeping to removing. Its order sets how sharp the change is: order 1 does not ring, and high orders ring almost like the ideal filter.

<figure markdown="span">
  ![Three panels: a zone plate whose rings get finer away from the center, the response H as a gray image, and the low-pass result, which keeps only the wide rings near the center.](../../assets/figures/butterworth-lowpass-light.svg#only-light){ width="480" }
  ![Three panels: a zone plate whose rings get finer away from the center, the response H as a gray image, and the low-pass result, which keeps only the wide rings near the center.](../../assets/figures/butterworth-lowpass-dark.svg#only-dark){ width="480" }
  <figcaption>The Butterworth low-pass filter keeps the rings near the center of the zone plate, where the frequency is low.</figcaption>
</figure>

## How it works

1. Extend the image with the border mode.
2. Split it into waves of many frequencies with the 2D FFT.
3. Multiply each frequency by H, which is 1 near the center of the spectrum and falls to 0 beyond the cutoff.
4. Add the waves back together with the inverse FFT and crop the extension.

## Mathematical foundation

--8<-- "filters/butterworth-lowpass-formula.md"

The filter works on the spectrum of the image. D is the distance of a frequency from the center of the spectrum, in cycles per pixel, so the same settings do the same thing on any image size. A frequency of 0.5 cycles per pixel, a stripe pattern with a period of 2 pixels, is the finest detail a pixel grid can hold. Gonzalez and Woods measure D in samples of the padded spectrum instead. The response changes smoothly. Gonzalez and Woods note that order 1 has no ringing, order 2 has very little, and higher orders ring more as the response approaches the ideal filter.

## Kernel or operator

The operator is the response H over the spectrum. The Inspector draws it as a gray image, with frequency 0 in the center, and as a profile along the f_x axis. The Frequency explorer in the Learn panel shows the spectrum of the image, H, their product and the result.

## Algorithm

--8<-- "filters/butterworth-lowpass-steps.md"

## Parameters

--8<-- "filters/butterworth-lowpass-params.md"

## Implementation

`butterworthLowpassFilter` in `web/src/core/filters/frequency/passband.ts` builds H with `passResponse`. `frequencyFilter` in `web/src/core/filters/frequency/spectral.ts` does the rest. The image is extended with the border mode by half its size, at most 256 pixels, on each side. It gets a little more to reach a length whose only prime factors are 2, 3 and 5. The FFT handles such lengths fast. This is the padding step of Gonzalez and Woods, with the border mode in place of zeros. Without it, the circular wrap of the FFT would mix opposite edges of the image. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result. The result is clipped to 0 to 255.

## Worked example

--8<-- "examples/butterworth-lowpass.md"

## Complexity

--8<-- "filters/butterworth-lowpass-complexity.md"

## Artifacts and limitations

--8<-- "filters/butterworth-lowpass-limits.md"

## Tests

The reference extends the plane with `numpy.pad`, filters it with `numpy.fft` and crops it, with the formulas of Gonzalez and Woods. Before the cases are written, the script checks the Gaussian low-pass filter against `scipy.ndimage.gaussian_filter` on a plane whose extension is an exact mirror. It also checks that each low-pass and high-pass pair, and each band-reject and band-pass pair, adds up to the image. The unit tests check the values at the cutoff and that a flat image passes a low-pass filter unchanged.

--8<-- "filters/butterworth-lowpass-tests.md"

## References

--8<-- "filters/butterworth-lowpass-references.md"
