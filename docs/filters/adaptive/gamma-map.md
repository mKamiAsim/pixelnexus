# Gamma-MAP filter

--8<-- "filters/gamma-map-facts.md"

## Overview

The Gamma-MAP filter finds the most likely clean value of each pixel under a statistical model of radar images: the scene and the speckle both follow gamma distributions. Like the enhanced Lee filter, it keeps the mean for pure speckle and the pixel for strong targets, and uses the model for everything between.

<figure markdown="span">
  ![Three panels: disks with gray speckle, the Lee result, and the Gamma-MAP result with smooth flat areas and sharp edges.](../../assets/figures/gamma-map-light.svg#only-light){ width="480" }
  ![Three panels: disks with gray speckle, the Lee result, and the Gamma-MAP result with smooth flat areas and sharp edges.](../../assets/figures/gamma-map-dark.svg#only-dark){ width="480" }
  <figcaption>Gamma-MAP smooths flat areas like the enhanced Lee filter and keeps the edges.</figcaption>
</figure>

## How it works

1. Find the mean and the coefficient of variation C_I of the window.
2. If C_I is at most C_u, write the mean. If it is at least C_max, keep the pixel.
3. Otherwise solve a quadratic for the most likely clean value, and write its larger root.

## Mathematical foundation

--8<-- "filters/gamma-map-formula.md"

A maximum a posteriori estimate maximizes the probability of the clean value R given the pixel z. The prior for R is a gamma distribution whose shape alpha comes from the local statistics, and the speckle is L-look gamma noise. Then the condition is the quadratic alpha R^2 - (alpha - L - 1) m R - L z m = 0. Its larger root is the formula above. The number of looks L is 1 / C_u^2.

## Kernel or operator

There is no kernel. The Inspector shows the formula with the current C_u. The Rank stepper in the Learn panel shows the window at any pixel next to the value the filter gives there.

## Algorithm

--8<-- "filters/gamma-map-steps.md"

## Parameters

--8<-- "filters/gamma-map-params.md"

## Implementation

`gammaMapValue` in `web/src/core/filters/adaptive/speckle.ts` applies the classes and the closed-form root to each pixel, with the local statistics shared by all speckle filters. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/gamma-map.md"

## Complexity

--8<-- "filters/gamma-map-complexity.md"

## Artifacts and limitations

--8<-- "filters/gamma-map-limits.md"

## Tests

No common library has this filter, so the reference applies the same formulas to NumPy windows of an input whose values are all above 0. Before it is used, the script checks that every value solves its quadratic. The test covers two window and C_u settings for all five border modes.

--8<-- "filters/gamma-map-tests.md"

## References

--8<-- "filters/gamma-map-references.md"
