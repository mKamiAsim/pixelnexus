# Lee filter

--8<-- "filters/lee-facts.md"

## Overview

The Lee filter reduces speckle, the multiplicative grain of radar, sonar, ultrasound and laser images. It compares how much each window varies, relative to its brightness, with how much the speckle alone would make it vary. Where the two are close, the window is flat and the pixel becomes the window mean. Where the window varies more, there is an edge or a target, and the pixel is kept.

<figure markdown="span">
  ![Three panels: disks with gray speckle, the Lee result with smooth areas and sharp disk edges, and a 7x7 box filter that blurs the edges.](../../assets/figures/lee-light.svg#only-light){ width="480" }
  ![Three panels: disks with gray speckle, the Lee result with smooth areas and sharp disk edges, and a 7x7 box filter that blurs the edges.](../../assets/figures/lee-dark.svg#only-dark){ width="480" }
  <figcaption>The Lee filter smooths the speckle in flat areas and keeps the disk edges. The box filter blurs them.</figcaption>
</figure>

## How it works

1. Find the mean and the standard deviation of the window, and their ratio C_I.
2. Compute the weight W = 1 - C_u^2 / C_I^2, at least 0.
3. Write the mean plus W times the difference between the pixel and the mean.

## Mathematical foundation

--8<-- "filters/lee-formula.md"

Speckle multiplies the clean value by a random factor with mean 1. Its coefficient of variation C_u, the standard deviation of the factor, is the same everywhere. So in a flat area the local coefficient of variation C_I, the window standard deviation over the window mean, is close to C_u. A window with an edge or a target varies more, and C_I is larger. Lee (1980) derived the weight from the linear minimum mean-square error estimate with a first-order approximation of the multiplicative model. Lopes, Touzi and Nezry write it with coefficients of variation, as here. A window that varies less than the speckle would give a negative weight, so W is limited to 0 and the output is the mean.

## Kernel or operator

There is no kernel. The Inspector shows the formula with the current C_u. The Rank stepper in the Learn panel shows the window at any pixel next to the value the filter gives there.

## Algorithm

--8<-- "filters/lee-steps.md"

## Parameters

--8<-- "filters/lee-params.md"

## Implementation

`leeFilter` in `web/src/core/filters/adaptive/speckle.ts` gets the window mean and variance from `localMoments`, with running sums in float64, and applies `leeWeight`. The other speckle filters share this code. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/lee.md"

## Complexity

--8<-- "filters/lee-complexity.md"

## Artifacts and limitations

--8<-- "filters/lee-limits.md"

## Tests

No common library has this filter, so the reference applies the same formulas to NumPy windows of an input whose values are all above 0. Before it is used, the script checks that C_u = 0 leaves the image unchanged. The test covers two window and C_u settings for all five border modes.

--8<-- "filters/lee-tests.md"

## References

--8<-- "filters/lee-references.md"
