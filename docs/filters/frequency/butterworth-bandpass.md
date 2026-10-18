# Butterworth band-pass filter

--8<-- "filters/butterworth-bandpass-facts.md"

## Overview

The Butterworth band-pass filter keeps only the frequencies in a ring around the center of the spectrum. The result holds the detail of one size. The Butterworth filter changes smoothly from keeping to removing. Its order sets how sharp the change is: order 1 does not ring, and high orders ring almost like the ideal filter.

<figure markdown="span">
  ![Three panels: a zone plate whose rings get finer away from the center, the response H as a gray image, and the band-pass result, which keeps a ring of the zone plate and is flat gray inside and outside it.](../../assets/figures/butterworth-bandpass-light.svg#only-light){ width="480" }
  ![Three panels: a zone plate whose rings get finer away from the center, the response H as a gray image, and the band-pass result, which keeps a ring of the zone plate and is flat gray inside and outside it.](../../assets/figures/butterworth-bandpass-dark.svg#only-dark){ width="480" }
  <figcaption>The Butterworth band-pass filter keeps only the rings whose frequency lies in the band.</figcaption>
</figure>

## How it works

1. Extend the image with the border mode.
2. Split it into waves of many frequencies with the 2D FFT.
3. Multiply each frequency by H, which is 1 in a ring around the center of the spectrum and 0 elsewhere.
4. Add the waves back together with the inverse FFT and crop the extension.

## Mathematical foundation

--8<-- "filters/butterworth-bandpass-formula.md"

The filter works on the spectrum of the image. D is the distance of a frequency from the center of the spectrum, in cycles per pixel, so the same settings do the same thing on any image size. A frequency of 0.5 cycles per pixel, a stripe pattern with a period of 2 pixels, is the finest detail a pixel grid can hold. Gonzalez and Woods measure D in samples of the padded spectrum instead. The band-pass response is 1 minus the Butterworth band-reject response, so the two results add up to the image. The response changes smoothly. Gonzalez and Woods note that order 1 has no ringing, order 2 has very little, and higher orders ring more as the response approaches the ideal filter.

## Kernel or operator

The operator is the response H over the spectrum. The Inspector draws it as a gray image, with frequency 0 in the center, and as a profile along the f_x axis. The Frequency explorer in the Learn panel shows the spectrum of the image, H, their product and the result.

## Algorithm

--8<-- "filters/butterworth-bandpass-steps.md"

## Parameters

--8<-- "filters/butterworth-bandpass-params.md"

## Implementation

`butterworthBandpassFilter` in `web/src/core/filters/frequency/passband.ts` builds H with `passResponse`. `frequencyFilter` in `web/src/core/filters/frequency/spectral.ts` does the rest. The image is extended with the border mode by half its size, at most 256 pixels, on each side. It gets a little more to reach a length whose only prime factors are 2, 3 and 5. The FFT handles such lengths fast. This is the padding step of Gonzalez and Woods, with the border mode in place of zeros. Without it, the circular wrap of the FFT would mix opposite edges of the image. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result. The result is signed, so the output mapping turns it into pixel values. The default offsets 0 to gray 128.

## Worked example

--8<-- "examples/butterworth-bandpass.md"

## Complexity

--8<-- "filters/butterworth-bandpass-complexity.md"

## Artifacts and limitations

--8<-- "filters/butterworth-bandpass-limits.md"

## Tests

The reference extends the plane with `numpy.pad`, filters it with `numpy.fft` and crops it, with the formulas of Gonzalez and Woods. Before the cases are written, the script checks the Gaussian low-pass filter against `scipy.ndimage.gaussian_filter` on a plane whose extension is an exact mirror. It also checks that each low-pass and high-pass pair, and each band-reject and band-pass pair, adds up to the image. The unit tests check the values at the cutoff and that a flat image passes a low-pass filter unchanged.

--8<-- "filters/butterworth-bandpass-tests.md"

## References

--8<-- "filters/butterworth-bandpass-references.md"
