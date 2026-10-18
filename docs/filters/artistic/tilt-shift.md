# Tilt-shift blur

--8<-- "filters/tilt-shift-facts.md"

## Overview

Tilt-shift photos show a narrow band in focus with blur above and below. The eye reads such a shallow focus as a close-up of something small, so a street or a town looks like a model. This filter imitates the look with a blur that grows with the distance from a sharp band.

<figure markdown="span">
  ![Two panels: a checkerboard, and the checkerboard sharp in a middle band and increasingly blurred toward the top and bottom.](../../assets/figures/tilt-shift-light.svg#only-light){ width="480" }
  ![Two panels: a checkerboard, and the checkerboard sharp in a middle band and increasingly blurred toward the top and bottom.](../../assets/figures/tilt-shift-dark.svg#only-dark){ width="480" }
  <figcaption>A checkerboard, and the tilt-shift blur with the default settings.</figcaption>
</figure>

## How it works

1. Blur the image with Gaussians at nine sigmas, from 0 to the largest.
2. Give each row a sigma from its distance to the sharp band.
3. Blend the two blurred copies whose sigmas lie around the row's sigma.

## Mathematical foundation

--8<-- "filters/tilt-shift-formula.md"

A true blur that changes from row to row cannot be split into a row pass and a column pass, since each row would need its own column kernel. The stack of nine blur levels avoids that. Blending two levels is not exactly the Gaussian of the sigma between them, but the levels are close enough that the change looks smooth.

## Kernel or operator

The Inspector shows the steps of the effect as formulas with the current settings.

## Algorithm

--8<-- "filters/tilt-shift-steps.md"

## Parameters

--8<-- "filters/tilt-shift-params.md"

## Implementation

`tiltShiftFilter` in `web/src/core/filters/artistic/lens.ts` uses `tiltShiftPlane` and `tiltSigma`. It is global, since the blur depends on the row's place in the whole image.

## Worked example

--8<-- "examples/tilt-shift.md"

## Complexity

--8<-- "filters/tilt-shift-complexity.md"

## Artifacts and limitations

--8<-- "filters/tilt-shift-limits.md"

## Tests

The reference writes the blur stack and the blend again with NumPy and SciPy, and compares every output value on the test images of the fixtures. A unit test checks that the rows inside the band stay exactly as they were.

--8<-- "filters/tilt-shift-tests.md"

## References

--8<-- "filters/tilt-shift-references.md"
