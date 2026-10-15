# Radon and Fourier slice filtering

--8<-- "filters/radon-filter-facts.md"

## Overview

This filter shows how computed tomography works. The Radon transform adds up the image along parallel lines, for many angles, as an X-ray scanner does. The result is the sinogram. Back projection spreads each set of sums back over the image along its lines. Alone, that gives a blurred image. With the ramp filter first, it gives the image back. You can show the sinogram, the plain back projection or the filtered one, and change the number of angles and the filter window. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Six panels: bright disks on a dark ground; their sinogram, a set of overlapping bright wavy bands; the plain back projection, a strongly blurred glow; the filtered back projection with 180 angles, close to the original; with 30 angles, the disks surrounded by a web of straight streaks; and with the Hann window, close to the original but slightly softer.](../../assets/figures/radon-filter-light.svg#only-light){ width="480" }
  ![Six panels: bright disks on a dark ground; their sinogram, a set of overlapping bright wavy bands; the plain back projection, a strongly blurred glow; the filtered back projection with 180 angles, close to the original; with 30 angles, the disks surrounded by a web of straight streaks; and with the Hann window, close to the original but slightly softer.](../../assets/figures/radon-filter-dark.svg#only-dark){ width="480" }
  <figcaption>The disks, their sinogram, the plain back projection, and the filtered back projection with 180 angles, with 30 angles, and with 180 angles and the Hann window.</figcaption>
</figure>

## How it works

1. Place the image in the middle of a square of zeros.
2. For each angle, add up the image along parallel lines at that angle. Each angle gives one column of the sinogram.
3. For the filtered back projection, sharpen each column with the ramp filter and the window.
4. Spread each column back over the image along its lines, and add up all angles.
5. Cut the result back to the image.

## Mathematical foundation

--8<-- "filters/radon-filter-formula.md"

The Fourier slice theorem is the key to rebuilding the image. It says that the 1-D Fourier transform of one projection equals the 2-D Fourier transform of the image along a line through the origin at the same angle. So the projections at all angles fill the whole spectrum, line by line, like the spokes of a wheel. Near the center the spokes are close together, so plain back projection gives the low frequencies too much weight. The image comes out blurred, and a single point spreads out like 1 / r. The ramp filter multiplies each frequency by its distance from the center, which evens out the weights. Kak and Slaney show that sampling the ramp in space, as h(k), avoids a small bias that a ramp sampled in frequency would add. Windows such as Hann or Hamming lower the highest frequencies, where noise lives, at the cost of some sharpness. Shepp and Logan proposed one of these windows in 1974, for images of the head.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. The first is the Radon transform with its angles. Then come the sinogram display, the plain back projection, or the ramp filter with its window and the filtered back projection.

## Algorithm

--8<-- "filters/radon-filter-steps.md"

## Parameters

--8<-- "filters/radon-filter-params.md"

## Implementation

`radon_filter` in `engine/src/pixelnexus_engine/filters/radon.py` runs `radon_plane` on each channel the scope names. The function `sinogram` places the plane in a square of zeros with `centered_square` and calls `skimage.transform.radon`. The function `back_project` calls `skimage.transform.iradon` with the chosen window, or with none for the plain back projection. Then it cuts the result back to the plane. The sinogram is resized to the image with `skimage.transform.resize`. With the brightness scope, the sinogram and the plain back projection come out gray. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/radon-filter.md"

## Complexity

--8<-- "filters/radon-filter-complexity.md"

## Artifacts and limitations

--8<-- "filters/radon-filter-limits.md"

## Tests

The projections of a disk are checked against its exact chord lengths, 2 sqrt(r^2 - t^2), at 12 angles. The Fourier slice theorem is checked exactly at 0 degrees. The whole filter is checked against `radon` and `iradon` of scikit-image on a square image. More tests check that a smooth image comes back closely, and that a point off the center of a wide image comes back in place. Plain back projection must fall off like 1 / r, and the ramp filter must remove that tail. The sinogram must fill the image size, and the Hann window must lower noise more than the ramp.

--8<-- "filters/radon-filter-tests.md"

## References

--8<-- "filters/radon-filter-references.md"
