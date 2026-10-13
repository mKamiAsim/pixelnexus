# Sigma filter

--8<-- "filters/sigma-facts.md"

## Overview

The sigma filter averages only the neighbors whose values lie within k sigma of the center value, where sigma is the noise level. Neighbors across an edge differ by more, so they are left out, and the edge stays sharp. If too few neighbors are in range, the center is an isolated spot of noise, and it gets the mean of its eight neighbors instead.

<figure markdown="span">
  ![A plot of one row across a noisy step edge. A 5x5 box filter turns the step into a slope. The sigma filter smooths the noise and keeps the step.](../../assets/figures/sigma-light.svg#only-light){ width="480" }
  ![A plot of one row across a noisy step edge. A 5x5 box filter turns the step into a slope. The sigma filter smooths the noise and keeps the step.](../../assets/figures/sigma-dark.svg#only-dark){ width="480" }
  <figcaption>The sigma filter averages only values within 2 sigma, so the step stays sharp. The box filter turns it into a slope.</figcaption>
</figure>

## How it works

1. Find the window values within k sigma of the center value.
2. If there are at least the minimum count, write their mean.
3. Otherwise write the mean of the eight neighbors.

## Mathematical foundation

--8<-- "filters/sigma-formula.md"

Lee (1983) based the filter on the two-sigma probability: about 95 percent of Gaussian noise lies within 2 standard deviations of the mean. So the values within 2 sigma of the center are likely to belong to the same region. The rule for isolated spots removes single noisy pixels, which have no neighbors in their range. The filter is related to the bilateral filter, with a range weight that is 1 inside the range and 0 outside.

## Kernel or operator

There is no kernel. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window values at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/sigma-steps.md"

## Parameters

--8<-- "filters/sigma-params.md"

## Implementation

`sigmaValue` in `web/src/core/filters/adaptive/sigma.ts` applies the rule to each window from `gatherPlane`. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/sigma.md"

## Complexity

--8<-- "filters/sigma-complexity.md"

## Artifacts and limitations

--8<-- "filters/sigma-limits.md"

## Tests

The reference applies the same rule to NumPy windows. Before it is used, the script checks that a huge range gives the box mean. The test covers three settings of size, sigma, k and the minimum count, for all five border modes.

--8<-- "filters/sigma-tests.md"

## References

--8<-- "filters/sigma-references.md"
