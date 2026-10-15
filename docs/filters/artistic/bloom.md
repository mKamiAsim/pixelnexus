# Bloom and glow

--8<-- "filters/bloom-facts.md"

## Overview

Bloom makes bright areas glow. Very bright light spreads a little in any lens and in the eye, so lights seem to shine past their edges. The filter blurs the bright part of the image and adds it back, in linear light.

<figure markdown="span">
  ![Two panels: small colored lights on a dark blue background, and the same lights with soft glows around them.](../../assets/figures/bloom-light.svg#only-light){ width="480" }
  ![Two panels: small colored lights on a dark blue background, and the same lights with soft glows around them.](../../assets/figures/bloom-dark.svg#only-dark){ width="480" }
  <figcaption>Small lights on a dark background, and the bloom with threshold 60, glow size 8 and strength 150.</figcaption>
</figure>

## How it works

1. Decode the image to linear light.
2. Keep the part of each pixel above the brightness threshold.
3. Blur that part with a Gaussian.
4. Add the blur back to the image and encode again.

## Mathematical foundation

--8<-- "filters/bloom-formula.md"

Light adds linearly, so the glow is added to linear values. The bright part rises linearly from 0 at the threshold to the whole pixel at white, which avoids a hard edge where the glow starts. Spencer and colleagues model glare as light spread from bright sources over the image. This filter is a simple version of that idea.

## Kernel or operator

The Inspector shows the steps of the effect as formulas with the current settings.

## Algorithm

--8<-- "filters/bloom-steps.md"

## Parameters

--8<-- "filters/bloom-params.md"

## Implementation

`bloomFilter` in `web/src/core/filters/artistic/lens.ts` uses `bloomPlanes`.

## Worked example

--8<-- "examples/bloom.md"

## Complexity

--8<-- "filters/bloom-complexity.md"

## Artifacts and limitations

--8<-- "filters/bloom-limits.md"

## Tests

The reference writes the bright pass, blur and sum again with NumPy and SciPy, and compares every output value on the test images of the fixtures. A unit test checks that strength 0 changes nothing.

--8<-- "filters/bloom-tests.md"

## References

--8<-- "filters/bloom-references.md"
