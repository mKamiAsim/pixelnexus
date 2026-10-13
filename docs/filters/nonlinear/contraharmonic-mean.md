# Contraharmonic mean filter

--8<-- "filters/contraharmonic-mean-facts.md"

## Overview

The contraharmonic mean filter weights each window value by its own power Q. With Q above 0, bright values weigh more and black specks hardly count. With Q below 0, dark values weigh more and white specks hardly count. It removes one kind of impulse noise at a time.

<figure markdown="span">
  ![Four panels in two rows: disks with black specks and a clean result with Q = 1.5, then disks with white specks and a clean result with Q = -1.5.](../../assets/figures/contraharmonic-mean-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with black specks and a clean result with Q = 1.5, then disks with white specks and a clean result with Q = -1.5.](../../assets/figures/contraharmonic-mean-dark.svg#only-dark){ width="480" }
  <figcaption>Q = 1.5 removes black specks. Q = -1.5 removes white specks.</figcaption>
</figure>

## How it works

1. Raise every window value to the power Q.
2. Use those powers as weights for a weighted mean of the window values.
3. Write the weighted mean.

## Mathematical foundation

--8<-- "filters/contraharmonic-mean-formula.md"

The formula is a weighted mean with the weights I to the power Q. Q = 0 gives the arithmetic mean and Q = -1 gives the harmonic mean. As Q grows toward plus infinity, the largest value dominates and the filter approaches the max filter. Toward minus infinity it approaches the min filter. When Q is below 0, a value of 0 gets an infinite weight. The limit of the formula is then 0, which is what the filter writes.

## Kernel or operator

There is no kernel, because the output is not a weighted sum. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/contraharmonic-mean-steps.md"

## Parameters

--8<-- "filters/contraharmonic-mean-params.md"

## Implementation

`contraharmonicPlane` in `web/src/core/filters/nonlinear/means.ts` sums the two powers of every value with running sums in float64, and counts the zeros when Q is below 0. A window whose bottom sum is 0, which means it holds only zeros, gives 0. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/contraharmonic-mean.md"

## Complexity

--8<-- "filters/contraharmonic-mean-complexity.md"

## Artifacts and limitations

--8<-- "filters/contraharmonic-mean-limits.md"

## Tests

The reference computes both power sums of each NumPy window. Before it is used, it is checked against two special cases: Q = 0 must equal `scipy.ndimage.uniform_filter`, and Q = -1 must equal the harmonic mean. The test covers four orders, including 0 and negative ones, on an input with three zeros, for window sizes 3 and 5 and three border modes.

--8<-- "filters/contraharmonic-mean-tests.md"

## References

--8<-- "filters/contraharmonic-mean-references.md"
