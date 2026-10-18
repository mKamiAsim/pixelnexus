# Frost filter

--8<-- "filters/frost-facts.md"

## Overview

The Frost filter is a weighted mean whose weights fall exponentially with the distance from the center. How fast they fall depends on the local variation. In flat areas the weights are nearly equal, and the filter averages the whole window. Near edges they fall fast, and the pixel stays close to itself.

<figure markdown="span">
  ![Three panels: disks with gray speckle, the Frost result with damping 1, smooth with soft edges, and with damping 5, sharper with more speckle left.](../../assets/figures/frost-light.svg#only-light){ width="480" }
  ![Three panels: disks with gray speckle, the Frost result with damping 1, smooth with soft edges, and with damping 5, sharper with more speckle left.](../../assets/figures/frost-dark.svg#only-dark){ width="480" }
  <figcaption>A small damping smooths strongly. A larger damping keeps more of the edges and the speckle.</figcaption>
</figure>

## How it works

1. Find the coefficient of variation C_I of the window.
2. Weight each window pixel by exp(-K C_I^2 d), where d is its distance from the center.
3. Write the weighted mean.

## Mathematical foundation

--8<-- "filters/frost-formula.md"

Frost and others derived the filter from a model of radar images in which the scene reflectivity is correlated with an exponential falloff. The decay rate of the weights grows with C_I squared, the local variation. This is the form most programs implement, with the damping K. With K = 0 every weight is 1 and the filter is the box mean.

## Kernel or operator

There is no fixed kernel. The Inspector shows the weight formula with the current damping. The worked example below lists the weights for one window.

## Algorithm

--8<-- "filters/frost-steps.md"

## Parameters

--8<-- "filters/frost-params.md"

## Implementation

`frostFilter` in `web/src/core/filters/adaptive/speckle.ts` computes C_I with running sums, then weights each window from `gatherPlane` by the precomputed distances. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/frost.md"

## Complexity

--8<-- "filters/frost-complexity.md"

## Artifacts and limitations

--8<-- "filters/frost-limits.md"

## Tests

No common library has this filter, so the reference applies the same formulas to NumPy windows of an input whose values are all above 0. Before it is used, the script checks that K = 0 gives `scipy.ndimage.uniform_filter`. The test covers two window and damping settings for all five border modes.

--8<-- "filters/frost-tests.md"

## References

--8<-- "filters/frost-references.md"
