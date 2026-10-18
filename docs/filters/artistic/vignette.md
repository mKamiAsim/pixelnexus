# Vignette

--8<-- "filters/vignette-facts.md"

## Overview

A vignette darkens an image toward its corners. Many lenses do this on their own, and photographers often add it on purpose to lead the eye to the center.

<figure markdown="span">
  ![Two panels: a flat gray square, and the same square darkening smoothly toward its corners.](../../assets/figures/vignette-light.svg#only-light){ width="480" }
  ![Two panels: a flat gray square, and the same square darkening smoothly toward its corners.](../../assets/figures/vignette-dark.svg#only-dark){ width="480" }
  <figcaption>A flat gray image, and the vignette with the default settings.</figcaption>
</figure>

## How it works

1. Measure each pixel's distance from the center, with the corners at 1.
2. Leave pixels closer than the start as they are.
3. Beyond the start, darken them smoothly, down to the amount at the corners.

## Mathematical foundation

--8<-- "filters/vignette-formula.md"

The smoothstep curve starts and ends flat, so there is no visible ring where the darkening begins or at the corners. In linear light, losing half the light lowers a gray of 200 to about 146, not to 100, because the sRGB encoding is not linear.

## Kernel or operator

The Inspector shows the distance and the falloff with the current settings.

## Algorithm

--8<-- "filters/vignette-steps.md"

## Parameters

--8<-- "filters/vignette-params.md"

## Implementation

`vignetteFilter` in `web/src/core/filters/artistic/effects.ts` multiplies each pixel by `vignetteFactor`. It is a global filter, because the factor depends on the position in the whole image.

## Worked example

--8<-- "examples/vignette.md"

## Complexity

--8<-- "filters/vignette-complexity.md"

## Artifacts and limitations

--8<-- "filters/vignette-limits.md"

## Tests

The fixture cases compare every pixel with a NumPy version of the same falloff, in linear light and on encoded values. One case uses an amount of 100 and a start of 0.

--8<-- "filters/vignette-tests.md"

## References

--8<-- "filters/vignette-references.md"
