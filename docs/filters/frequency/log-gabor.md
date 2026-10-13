# Log-Gabor filter

--8<-- "filters/log-gabor-facts.md"

## Overview

The log-Gabor filter is a band-pass filter that is a Gaussian on a log frequency scale. Unlike a Gabor filter, it has no response at frequency 0, so flat areas give 0. Its band can be wide, with a long tail toward fine detail, which matches the spectrum of natural images. With one direction it finds lines and edges like a Gabor filter.

<figure markdown="span">
  ![Three panels: a Siemens star, the response H as a bright blob on the right of the spectrum, and the magnitude result, bright where the spokes run up and down.](../../assets/figures/log-gabor-light.svg#only-light){ width="480" }
  ![Three panels: a Siemens star, the response H as a bright blob on the right of the spectrum, and the magnitude result, bright where the spokes run up and down.](../../assets/figures/log-gabor-dark.svg#only-dark){ width="480" }
  <figcaption>A log-Gabor filter with wavelength 8 and angle 0 responds to the parts of the star whose stripes run up and down.</figcaption>
</figure>

## How it works

1. Transform the image with the FFT.
2. Multiply by the log-Gabor response, which keeps a band of frequencies around 1 / wavelength.
3. With one direction, the response keeps only frequencies near that direction.
4. Transform back and show the magnitude, the real part or the imaginary part.

## Mathematical foundation

--8<-- "filters/log-gabor-formula.md"

Field's radial log-Gabor function is a Gaussian of ln(f / f_0). On a log scale it is symmetric, so it falls as fast toward 2 f_0 as toward f_0 / 2, and it is 0 at frequency 0. The ratio sigma / f_0 sets the bandwidth: 0.55 gives about 2 octaves. Kovesi multiplies it by a Gaussian of the angle to the filter direction. That response covers one side of the spectrum, so the result is complex. Its real part is an even, line-like response and its imaginary part an odd, edge-like one. The angle turns counterclockwise on screen, as for the Gabor filter.

## Kernel or operator

The operator is the response H, which the Inspector draws over the spectrum, with its profile along the f_x axis.

## Algorithm

--8<-- "filters/log-gabor-steps.md"

## Parameters

--8<-- "filters/log-gabor-params.md"

## Implementation

`logGaborFilter` in `web/src/core/filters/frequency/shaping.ts` builds H with `logGaborResponse`. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/log-gabor.md"

## Complexity

--8<-- "filters/log-gabor-complexity.md"

## Artifacts and limitations

--8<-- "filters/log-gabor-limits.md"

## Tests

The reference extends the plane with `numpy.pad`, filters it with `numpy.fft` and crops it. The cases cover the three outputs with one direction and the real result without a direction.

--8<-- "filters/log-gabor-tests.md"

## References

--8<-- "filters/log-gabor-references.md"
