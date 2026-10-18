# Tikhonov regularization

--8<-- "filters/tikhonov-facts.md"

## Overview

Tikhonov regularization undoes a known blur and keeps the result smooth. It looks for the image that, blurred, matches the input best, plus a penalty on its roughness or size. The weight lambda sets the balance between sharpness and noise.

<figure markdown="span">
  ![Three panels: disks with defocus blur and noise, the inverse filter result covered in noise, and the Tikhonov result with sharper disks and little noise.](../../assets/figures/tikhonov-light.svg#only-light){ width="480" }
  ![Three panels: disks with defocus blur and noise, the inverse filter result covered in noise, and the Tikhonov result with sharper disks and little noise.](../../assets/figures/tikhonov-dark.svg#only-dark){ width="480" }
  <figcaption>Defocus blur with noise of sigma 4. The inverse filter raises the noise, and Tikhonov with the gradient penalty keeps it down.</figcaption>
</figure>

## How it works

1. Take the spectrum G of the blurred image and the transform H of the blur.
2. Multiply each frequency by conj(H) / (|H|^2 + lambda |L|^2), where L is the penalty.
3. Transform back.

## Mathematical foundation

--8<-- "filters/tikhonov-formula.md"

Deblurring is ill-posed: many images blur to nearly the same result, and the exact inverse raises noise without limit. Tikhonov adds a penalty lambda |L f|^2 to the error |h * f - g|^2. For a convolution the best f has a closed form, one division per frequency. The gradient penalty is 0 at frequency 0 and grows with frequency, so it holds back fine noise and keeps the mean brightness. With the identity as L, the filter is Wiener deconvolution with K = lambda.

## Kernel or operator

The Inspector lists the stages, with the PSF, lambda and the penalty.

## Algorithm

--8<-- "filters/tikhonov-steps.md"

## Parameters

--8<-- "filters/tikhonov-params.md"

## Implementation

`tikhonovFilter` in `web/src/core/filters/restoration/deconvolve.ts` multiplies the spectrum by the gain of `regularizedGain`. As for the frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. H is the FFT of the PSF placed with its center at the origin of the FFT grid. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/tikhonov.md"

## Complexity

--8<-- "filters/tikhonov-complexity.md"

## Artifacts and limitations

--8<-- "filters/tikhonov-limits.md"

## Tests

The reference builds the same gain with NumPy for the three penalties and three PSFs, and filters the plane extended with `numpy.pad`.

--8<-- "filters/tikhonov-tests.md"

## References

--8<-- "filters/tikhonov-references.md"
