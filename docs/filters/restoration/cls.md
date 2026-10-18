# Constrained least squares

--8<-- "filters/cls-facts.md"

## Overview

Constrained least squares undoes a known blur with a smoothness penalty, like Tikhonov regularization with the Laplacian. Instead of a weight chosen by hand, it takes the noise level. It sets the weight so the result, blurred again, differs from the image by as much as the noise does.

<figure markdown="span">
  ![Three panels: disks with defocus blur and noise, the constrained least squares result with sharper disks, and the clean disks.](../../assets/figures/cls-light.svg#only-light){ width="480" }
  ![Three panels: disks with defocus blur and noise, the constrained least squares result with sharper disks, and the clean disks.](../../assets/figures/cls-dark.svg#only-dark){ width="480" }
  <figcaption>Constrained least squares with sigma 4 chooses its own weight from the noise level.</figcaption>
</figure>

## How it works

1. Take the spectrum G of the blurred image and the transform H of the blur.
2. Try weights gamma by bisection until the residual of the result matches the noise.
3. Multiply each frequency by conj(H) / (|H|^2 + gamma |P|^2), with P the Laplacian.
4. Transform back.

## Mathematical foundation

--8<-- "filters/cls-formula.md"

Gonzalez and Woods minimize the roughness |p * f|^2, with p the Laplacian, under the constraint |g - h * f|^2 = |n|^2, the size of the noise. The solution is the Tikhonov form with a weight gamma, the Lagrange multiplier of the constraint. The residual grows with gamma. So a bisection on log10 gamma finds the gamma whose residual, as a mean square per FFT sample, equals sigma^2. Gonzalez and Woods adjust gamma step by step instead. The bisection is this filter's own search.

## Kernel or operator

The Inspector lists the stages, with the PSF and the noise level.

## Algorithm

--8<-- "filters/cls-steps.md"

## Parameters

--8<-- "filters/cls-params.md"

## Implementation

`clsFilter` in `web/src/core/filters/restoration/deconvolve.ts` finds gamma with `clsGamma` and multiplies the spectrum by the gain of `regularizedGain` with the Laplacian. As for the frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. H is the FFT of the PSF placed with its center at the origin of the FFT grid. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/cls.md"

## Complexity

--8<-- "filters/cls-complexity.md"

## Artifacts and limitations

--8<-- "filters/cls-limits.md"

## Tests

The reference runs the same bisection with NumPy on a plane that is blurred and rounded first. The cases cover two noise levels and two border modes.

--8<-- "filters/cls-tests.md"

## References

--8<-- "filters/cls-references.md"
