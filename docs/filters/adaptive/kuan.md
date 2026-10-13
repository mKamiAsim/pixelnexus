# Kuan filter

--8<-- "filters/kuan-facts.md"

## Overview

The Kuan filter reduces speckle with the same idea as the Lee filter: smooth where the window varies only by speckle, keep where it varies more. Kuan, Sawchuk, Strand and Chavel derived the weight without the approximation Lee made, by treating the speckle as a signal-dependent additive noise. The result is the Lee weight divided by 1 + C_u squared.

<figure markdown="span">
  ![A plot of one row across a speckled step edge. The Lee and Kuan results are close. The Kuan line is a little smoother.](../../assets/figures/kuan-light.svg#only-light){ width="480" }
  ![A plot of one row across a speckled step edge. The Lee and Kuan results are close. The Kuan line is a little smoother.](../../assets/figures/kuan-dark.svg#only-dark){ width="480" }
  <figcaption>The Kuan weight is a little smaller than the Lee weight, so it smooths a little more everywhere.</figcaption>
</figure>

## How it works

1. Find the mean and the coefficient of variation C_I of the window.
2. Compute the weight W = (1 - C_u^2 / C_I^2) / (1 + C_u^2), at least 0.
3. Write the mean plus W times the difference between the pixel and the mean.

## Mathematical foundation

--8<-- "filters/kuan-formula.md"

Speckle multiplies the clean value by a random factor with mean 1. Its coefficient of variation C_u, the standard deviation of the factor, is the same everywhere. So in a flat area the local coefficient of variation C_I, the window standard deviation over the window mean, is close to C_u. A window with an edge or a target varies more, and C_I is larger. The Kuan weight is the exact linear minimum mean-square error weight for this model. Because of the factor 1 / (1 + C_u^2), it never reaches 1, so even strong edges are smoothed a little. For weak speckle, C_u is small and the Kuan and Lee filters almost agree.

## Kernel or operator

There is no kernel. The Inspector shows the formula with the current C_u. The Rank stepper in the Learn panel shows the window at any pixel next to the value the filter gives there.

## Algorithm

--8<-- "filters/kuan-steps.md"

## Parameters

--8<-- "filters/kuan-params.md"

## Implementation

`kuanFilter` in `web/src/core/filters/adaptive/speckle.ts` shares the local statistics with the Lee filter and applies `kuanWeight`. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/kuan.md"

## Complexity

--8<-- "filters/kuan-complexity.md"

## Artifacts and limitations

--8<-- "filters/kuan-limits.md"

## Tests

No common library has this filter, so the reference applies the same formulas to NumPy windows of an input whose values are all above 0. Before it is used, the script checks that its weights are the Lee weights divided by 1 + C_u^2. The test covers two window and C_u settings for all five border modes.

--8<-- "filters/kuan-tests.md"

## References

--8<-- "filters/kuan-references.md"
