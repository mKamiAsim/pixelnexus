# Gabor filter

--8<-- "filters/gabor-facts.md"

## Overview

A Gabor filter is a wave under a Gaussian window. It responds strongly where the image has stripes or edges with the wavelength and direction of the wave, and weakly elsewhere. Its complex response has two parts: the real part, a cosine wave, finds thin lines, and the imaginary part, a sine wave, finds edges. The magnitude combines both.

<figure markdown="span">
  ![Four panels: a Siemens star with black and white spokes, and the Gabor magnitude at angles 0, 45 and 90 degrees. Each one is bright where the spokes run across its direction, about 20 pixels from the center.](../../assets/figures/gabor-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star with black and white spokes, and the Gabor magnitude at angles 0, 45 and 90 degrees. Each one is bright where the spokes run across its direction, about 20 pixels from the center.](../../assets/figures/gabor-dark.svg#only-dark){ width="480" }
  <figcaption>Gabor magnitude with wavelength 8 on a Siemens star. Each angle lights up the spokes that run across its direction, at the radius where their spacing is about 8 pixels.</figcaption>
</figure>

## How it works

1. Build a cosine and a sine wave with the chosen wavelength and direction.
2. Multiply both by a Gaussian window.
3. Correlate the image with both kernels, and keep the real part, the imaginary part or the magnitude.

## Mathematical foundation

--8<-- "filters/gabor-formula.md"

Gabor showed in 1946 that a wave under a Gaussian window is as compact as a signal can be in time and frequency at once. Daugman extended this to two dimensions and showed that such filters fit the simple cells of the visual cortex. In practice, the Gaussian sets where the filter looks and the wave sets what it looks for. A larger sigma fits more stripes in the window, so the filter becomes more selective about wavelength and less precise about position.

## Kernel or operator

The Inspector shows the real and the imaginary kernels with the current parameters. They are computed by the same function the filter runs.

## Algorithm

--8<-- "filters/gabor-steps.md"

## Parameters

--8<-- "filters/gabor-params.md"

## Implementation

`gaborKernels` in `web/src/core/filters/linear/gabor.ts` builds both kernels with the size rule and scale of `skimage.filters.gabor_kernel`. The kernels are large, so `planeSpectrum` in `web/src/core/filters/convolve.ts` correlates through the FFT of the extended tile, which gives the same values as direct correlation up to rounding. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/gabor.md"

## Complexity

--8<-- "filters/gabor-complexity.md"

## Artifacts and limitations

--8<-- "filters/gabor-limits.md"

## Tests

The reference builds the same kernels with NumPy and runs `scipy.ndimage.correlate`. Before the cases are written, the script checks them against `skimage.filters.gabor` at the opposite angle, because scikit-image turns the other way. The real parts agree. scikit-image convolves, so the imaginary parts agree after a change of sign. A separate test checks the FFT correlation against direct correlation for all five border modes. The cases cover four settings and the three outputs for all five border modes.

--8<-- "filters/gabor-tests.md"

## References

--8<-- "filters/gabor-references.md"
