# Homomorphic filter

--8<-- "filters/homomorphic-facts.md"

## Overview

The homomorphic filter evens out uneven lighting and raises local contrast. It treats the image as lighting times reflectance. A logarithm turns the product into a sum, so a frequency filter can turn the slow lighting down and the detail up. The filter is listed under enhancement too.

<figure markdown="span">
  ![Three panels: disks lit brightly on the left and dimly on the right, the response H as a gray image with a dark center, and the result with the disks evenly bright.](../../assets/figures/homomorphic-light.svg#only-light){ width="480" }
  ![Three panels: disks lit brightly on the left and dimly on the right, the response H as a gray image with a dark center, and the result with the disks evenly bright.](../../assets/figures/homomorphic-dark.svg#only-dark){ width="480" }
  <figcaption>Homomorphic filtering turns down the lighting, which falls across the image, and keeps the disks.</figcaption>
</figure>

## How it works

1. Take ln(1 + f) of every value.
2. Transform it with the FFT and multiply by H, which is gamma_L near the center and gamma_H far from it.
3. Transform back and take exp of the result minus 1.
4. Stretch the result to the full range, the default output mapping.

## Mathematical foundation

--8<-- "filters/homomorphic-formula.md"

With f = i r, lighting i times reflectance r, the logarithm gives ln f = ln i + ln r. Lighting changes slowly, so ln i sits at low frequencies, and ln r holds the edges and texture at high frequencies. A high-emphasis response with gamma_L below 1 and gamma_H above 1 turns ln i down and ln r up. The exponential then turns the sum back into a product. The response and the steps follow Gonzalez and Woods, with D in cycles per pixel. The filter uses ln(1 + f), so black pixels have a logarithm.

## Kernel or operator

The operator is the response H, which the Inspector draws over the spectrum. It acts on the spectrum of the log image.

## Algorithm

--8<-- "filters/homomorphic-steps.md"

## Parameters

--8<-- "filters/homomorphic-params.md"

## Implementation

`homomorphicFilter` in `web/src/core/filters/frequency/shaping.ts` takes the logarithm, filters with `homomorphicResponse` and takes the exponential. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/homomorphic.md"

## Complexity

--8<-- "filters/homomorphic-complexity.md"

## Artifacts and limitations

--8<-- "filters/homomorphic-limits.md"

## Tests

The reference extends the plane with `numpy.pad`, filters it with `numpy.fft` and crops it. Before the cases are written, the script checks that equal gains of 1 keep the image.

--8<-- "filters/homomorphic-tests.md"

## References

--8<-- "filters/homomorphic-references.md"
