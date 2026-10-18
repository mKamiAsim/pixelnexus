# Halftone

--8<-- "filters/halftone-facts.md"

## Overview

Halftoning makes gray from black ink only, as newspapers print photos. The image is redrawn as round black dots on a turned grid. Each dot covers the share of its cell that the image is dark there, so the eye sees the right gray from a distance.

<figure markdown="span">
  ![Two panels: a gray ramp from black to white, and its halftone with large merging dots at the dark end and small dots at the light end.](../../assets/figures/halftone-light.svg#only-light){ width="480" }
  ![Two panels: a gray ramp from black to white, and its halftone with large merging dots at the dark end and small dots at the light end.](../../assets/figures/halftone-dark.svg#only-dark){ width="480" }
  <figcaption>A gray ramp, and its halftone with cells of 8 pixels at 45 degrees.</figcaption>
</figure>

## How it works

1. Lay a grid of square cells over the image, turned by the screen angle.
2. Read the darkness of each cell at its center from a box blurred copy.
3. Find the dot radius whose area inside the cell matches that darkness.
4. Paint each pixel black inside the dot and white outside, with a soft edge.

## Mathematical foundation

--8<-- "filters/halftone-formula.md"

Up to a quarter of pi, about 78.5 percent ink, the dot fits inside the cell and its area is pi rho^2. A larger dot is cut by the four sides of the cell. Each side cuts off a circular segment of area rho^2 acos(h / rho) - h sqrt(rho^2 - h^2), with h half the cell. The area is monotonic in rho, so bisection finds the radius for any ink share. Black ink then covers the whole cell.

## Kernel or operator

The Inspector shows the steps of the effect as formulas with the current settings.

## Algorithm

--8<-- "filters/halftone-steps.md"

## Parameters

--8<-- "filters/halftone-params.md"

## Implementation

`halftoneFilter` in `web/src/core/filters/artistic/painterly.ts` uses `halftonePlane`, `dotRadius` and `circleInSquare`. It is global, since the screen depends on the position in the whole image.

## Worked example

--8<-- "examples/halftone.md"

## Complexity

--8<-- "filters/halftone-complexity.md"

## Artifacts and limitations

--8<-- "filters/halftone-limits.md"

## Tests

The reference writes the screen and the dot rules again with NumPy and SciPy, and compares every output value on the test images of the fixtures. Unit tests check that the dot area inside the cell equals the ink share, and that flat grays keep their mean within a few levels.

--8<-- "filters/halftone-tests.md"

## References

--8<-- "filters/halftone-references.md"
