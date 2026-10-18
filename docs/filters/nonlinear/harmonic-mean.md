# Harmonic mean filter

--8<-- "filters/harmonic-mean-facts.md"

## Overview

The harmonic mean filter replaces each pixel with n divided by the sum of the inverses of its n window values. Dark values have large inverses, so they dominate. White specks hardly change the result, but a single black pixel makes it 0.

<figure markdown="span">
  ![Four panels in two rows: disks with white specks and a clean harmonic mean result, then disks with black specks and a harmonic mean result with black squares.](../../assets/figures/harmonic-mean-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with white specks and a clean harmonic mean result, then disks with black specks and a harmonic mean result with black squares.](../../assets/figures/harmonic-mean-dark.svg#only-dark){ width="480" }
  <figcaption>The harmonic mean removes white specks but turns black specks into black squares.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel.
2. Add up 1 divided by each value.
3. Write the number of values divided by that sum.

## Mathematical foundation

--8<-- "filters/harmonic-mean-formula.md"

For positive values, the harmonic mean is never larger than the geometric mean, which is never larger than the arithmetic mean. The harmonic mean is the contraharmonic mean with Q = -1. A value of 0 has an infinite inverse, so a window that holds a 0 gives 0.

## Kernel or operator

There is no kernel, because the output is not a weighted sum. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/harmonic-mean-steps.md"

## Parameters

--8<-- "filters/harmonic-mean-params.md"

## Implementation

`harmonicMeanFilter` in `web/src/core/filters/nonlinear/means.ts` sums the inverses of the values above 0 and counts the zeros with running sums in float64. In the constant border mode, the positions outside the image count as zeros. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/harmonic-mean.md"

## Complexity

--8<-- "filters/harmonic-mean-complexity.md"

## Artifacts and limitations

--8<-- "filters/harmonic-mean-limits.md"

## Tests

The reference divides n by the sum of inverses of each NumPy window. Before it is used, it is checked against `scipy.stats.hmean` on windows without zeros. The test input has three zeros, for window sizes 3 and 5 and three border modes.

--8<-- "filters/harmonic-mean-tests.md"

## References

--8<-- "filters/harmonic-mean-references.md"
