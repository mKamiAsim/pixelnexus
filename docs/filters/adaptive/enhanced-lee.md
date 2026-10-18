# Enhanced Lee filter

--8<-- "filters/enhanced-lee-facts.md"

## Overview

The enhanced Lee filter sorts each window into one of three classes by its coefficient of variation. Pure speckle gets the window mean, so flat areas are fully smoothed. Strong targets and edges, with a variation above C_max, are kept unchanged. Windows between get a smooth blend of the mean and the pixel.

<figure markdown="span">
  ![Three panels: disks with gray speckle, the Lee result, and the enhanced Lee result with smoother flat areas and the small bright dots kept.](../../assets/figures/enhanced-lee-light.svg#only-light){ width="480" }
  ![Three panels: disks with gray speckle, the Lee result, and the enhanced Lee result with smoother flat areas and the small bright dots kept.](../../assets/figures/enhanced-lee-dark.svg#only-dark){ width="480" }
  <figcaption>The enhanced Lee filter smooths flat areas fully and keeps the small bright dots.</figcaption>
</figure>

## How it works

1. Find the mean and the coefficient of variation C_I of the window.
2. If C_I is at most C_u, write the mean. If it is at least C_max, keep the pixel.
3. Otherwise blend the mean and the pixel with the weight W = exp(-K (C_I - C_u) / (C_max - C_I)).

## Mathematical foundation

--8<-- "filters/enhanced-lee-formula.md"

Speckle multiplies the clean value by a random factor with mean 1. Its coefficient of variation C_u, the standard deviation of the factor, is the same everywhere. So in a flat area the local coefficient of variation C_I, the window standard deviation over the window mean, is close to C_u. A window with an edge or a target varies more, and C_I is larger. Lopes, Touzi and Nezry add the upper limit C_max = sqrt(1 + 2 C_u^2), the largest variation that speckle alone is expected to reach. Above it, the window holds a real target, so nothing is changed. The weight W falls from 1 at C_u to 0 at C_max, and the damping K sets how fast.

## Kernel or operator

There is no kernel. The Inspector shows the formula with the current C_u. The Rank stepper in the Learn panel shows the window at any pixel next to the value the filter gives there.

## Algorithm

--8<-- "filters/enhanced-lee-steps.md"

## Parameters

--8<-- "filters/enhanced-lee-params.md"

## Implementation

`enhancedLeeValue` in `web/src/core/filters/adaptive/speckle.ts` applies the three classes to each pixel, with the local statistics shared by all speckle filters. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/enhanced-lee.md"

## Complexity

--8<-- "filters/enhanced-lee-complexity.md"

## Artifacts and limitations

--8<-- "filters/enhanced-lee-limits.md"

## Tests

No common library has this filter, so the reference applies the same formulas to NumPy windows of an input whose values are all above 0. It follows the three classes of Lopes, Touzi and Nezry. The test covers two window and C_u settings with damping 1 for all five border modes.

--8<-- "filters/enhanced-lee-tests.md"

## References

--8<-- "filters/enhanced-lee-references.md"
