# Spectral whitening

--8<-- "filters/spectral-whitening-facts.md"

## Overview

Spectral whitening evens out the spectrum of an image. In natural images the strength of the spectrum falls with frequency, so coarse detail is much stronger than fine detail. Whitening scales each ring of the spectrum to the same mean strength. A strength setting blends from no change to a flat spectrum.

<figure markdown="span">
  ![Three panels: disks, the result at strength 0.5 with sharper edges, and the result at strength 1 with strong outlines and a grainy look.](../../assets/figures/spectral-whitening-light.svg#only-light){ width="480" }
  ![Three panels: disks, the result at strength 0.5 with sharper edges, and the result at strength 1 with strong outlines and a grainy look.](../../assets/figures/spectral-whitening-dark.svg#only-dark){ width="480" }
  <figcaption>Whitening raises fine detail until all rings of the spectrum are equally strong.</figcaption>
</figure>

## How it works

1. Transform the image with the FFT.
2. Average the magnitude over each ring of frequencies at the same distance from the center.
3. Scale each frequency by the mean magnitude of the spectrum over its ring mean, raised to the strength.
4. Transform back.

## Mathematical foundation

--8<-- "filters/spectral-whitening-formula.md"

Field showed that the magnitude of the spectrum of natural images falls roughly as 1 over the frequency. A spectrum with the same strength at every frequency is called white, after white light. The ring mean A(r) estimates the magnitude at each distance r, and the factor (M / A)^alpha scales it toward the mean M. With alpha = 1 every ring has mean M. Frequency 0, the mean brightness, is kept. Using the ring mean is this filter's own choice. It ignores direction, so an image with strong stripes in one direction is whitened as a whole ring.

## Kernel or operator

The gain depends on the image, so the Inspector lists the stages. The Frequency explorer shows the gain on the patch.

## Algorithm

--8<-- "filters/spectral-whitening-steps.md"

## Parameters

--8<-- "filters/spectral-whitening-params.md"

## Implementation

`spectralWhiteningFilter` in `web/src/core/filters/frequency/shaping.ts` computes the gains with `whiteningValues`. Ring means below 1e-9 times the largest magnitude count as 0. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/spectral-whitening.md"

## Complexity

--8<-- "filters/spectral-whitening-complexity.md"

## Artifacts and limitations

--8<-- "filters/spectral-whitening-limits.md"

## Tests

The reference extends the plane with `numpy.pad`, filters it with `numpy.fft` and crops it. Before the cases are written, the script checks that strength 0 keeps the image.

--8<-- "filters/spectral-whitening-tests.md"

## References

--8<-- "filters/spectral-whitening-references.md"
