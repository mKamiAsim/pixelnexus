# Add periodic noise

--8<-- "filters/noise-periodic-facts.md"

## Overview

Add periodic noise lays a sine wave of one frequency and direction over the image. It is the model of periodic interference in Gonzalez and Woods, and it makes test images for the notch filters and periodic noise suppression. The wave makes two bright peaks in the spectrum.

<figure markdown="span">
  ![Three panels: disks, the same disks with diagonal stripes, and the spectrum of the striped image with two bright peaks.](../../assets/figures/noise-periodic-light.svg#only-light){ width="480" }
  ![Three panels: disks, the same disks with diagonal stripes, and the spectrum of the striped image with two bright peaks.](../../assets/figures/noise-periodic-dark.svg#only-dark){ width="480" }
  <figcaption>A wave of frequency (0.1, 0.05) cycles per pixel adds stripes, and two bright peaks in the spectrum.</figcaption>
</figure>

## How it works

1. Compute the wave A sin(2 pi (fx x + fy y) + phase) at the image position of each pixel.
2. Add it to the value of the pixel.
3. Clip the result to 0 to 255.

## Mathematical foundation

--8<-- "filters/noise-periodic-formula.md"

A sine wave holds a single frequency. Its spectrum is a pair of impulses at (fx, fy) and (-fx, -fy). The stripes run across the direction of (fx, fy), with a period of 1 / sqrt(fx^2 + fy^2) pixels.

## Kernel or operator

There is no kernel. The Inspector describes the wave with the current values.

## Algorithm

--8<-- "filters/noise-periodic-steps.md"

## Parameters

--8<-- "filters/noise-periodic-params.md"

## Implementation

`noisePeriodicFilter` in `web/src/core/filters/frequency/notch.ts` adds the wave. It uses the image position of each pixel, so a region gives the same values as the whole image. The filter runs through the shared framework in `web/src/core/filters/run.ts`, which handles the channel scope, alpha and clipping.

## Worked example

--8<-- "examples/noise-periodic.md"

## Complexity

--8<-- "filters/noise-periodic-complexity.md"

## Artifacts and limitations

--8<-- "filters/noise-periodic-limits.md"

## Tests

The reference computes the same wave with `numpy.sin`. The cases cover an oblique wave with a phase and a vertical one.

--8<-- "filters/noise-periodic-tests.md"

## References

--8<-- "filters/noise-periodic-references.md"
