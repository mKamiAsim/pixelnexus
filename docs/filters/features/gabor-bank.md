# Gabor filter bank

--8<-- "filters/gabor-bank-facts.md"

## Overview

A Gabor filter bank runs many Gabor filters at once, at several wavelengths and several orientations, and combines their responses into one value per pixel. The largest or the mean magnitude measures how much texture there is, at any of the scales and directions in the bank. The angle of the strongest filter shows the local direction of stripes and edges.

<figure markdown="span">
  ![Three panels: a Siemens star, the largest magnitude of the bank, which is bright over the spokes, and the angle of the strongest filter, which shows four sectors of different gray for the four spoke directions.](../../assets/figures/gabor-bank-light.svg#only-light){ width="480" }
  ![Three panels: a Siemens star, the largest magnitude of the bank, which is bright over the spokes, and the angle of the strongest filter, which shows four sectors of different gray for the four spoke directions.](../../assets/figures/gabor-bank-dark.svg#only-dark){ width="480" }
  <figcaption>A bank of 3 scales and 4 orientations on a Siemens star. The largest magnitude shows texture strength at every radius. The angle of the strongest filter gives each spoke direction its own gray level.</figcaption>
</figure>

## How it works

1. List the wavelengths, from the smallest one up by the scale factor, and the angles, evenly spread over 180 degrees.
2. Run a Gabor filter for every pair of a wavelength and an angle, and take its magnitude.
3. Keep the largest magnitude, the mean, or the angle of the strongest filter.

## Mathematical foundation

--8<-- "filters/gabor-bank-formula.md"

One Gabor filter sees one scale and one direction. Texture rarely has a single scale or direction, so banks sample both. Scales usually grow by a constant factor, often 2, which is one octave. Sigma is tied to the wavelength through the bandwidth b, in octaves. Sigma equals the wavelength times (1 / pi) sqrt(ln 2 / 2) (2^b + 1) / (2^b - 1). The same relation sets sigma in scikit-image. Kruizinga and Petkov, and Grigorescu and colleagues, compare texture features built on such banks.

## Kernel or operator

The Inspector lists the wavelengths and angles of the bank and the rule that combines them. Each kernel is a Gabor kernel, shown on the Gabor filter page.

## Algorithm

--8<-- "filters/gabor-bank-steps.md"

## Parameters

--8<-- "filters/gabor-bank-params.md"

## Implementation

`gaborBank` in `web/src/core/filters/features/gabor-bank.ts` lists the filters. The filter takes the FFT of the extended tile once with `planeSpectrum` and correlates every complex Gabor kernel through it. For the angle output, the first filter within a relative 1e-9 of the largest magnitude wins, so exact ties next to a mirrored border do not depend on rounding. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/gabor-bank.md"

## Complexity

--8<-- "filters/gabor-bank-complexity.md"

## Artifacts and limitations

--8<-- "filters/gabor-bank-limits.md"

## Tests

The reference runs `scipy.ndimage.correlate` with every kernel of the bank and combines the magnitudes with NumPy, using the same rule for ties. Before the cases are written, the script checks single filters with aspect ratio 1 against `skimage.filters.gabor` with the same bandwidth, which confirms the sigma relation. The cases cover two banks and the three outputs for all five border modes.

--8<-- "filters/gabor-bank-tests.md"

## References

--8<-- "filters/gabor-bank-references.md"
