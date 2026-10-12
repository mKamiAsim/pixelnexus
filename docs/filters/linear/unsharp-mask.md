# Unsharp mask

--8<-- "filters/unsharp-mask-facts.md"

## Overview

Unsharp masking sharpens an image by adding back the detail that a blur removes. The name comes from darkroom work, where a blurred copy of a negative was used as a mask.

<figure markdown="span">
  ![A line plot across a soft edge, before and after unsharp masking with sigma 2 and amount 1. The result dips below the dark level and rises above the bright level next to the edge.](../../assets/figures/unsharp-mask-light.svg#only-light){ width="480" }
  ![A line plot across a soft edge, before and after unsharp masking with sigma 2 and amount 1. The result dips below the dark level and rises above the bright level next to the edge.](../../assets/figures/unsharp-mask-dark.svg#only-dark){ width="480" }
  <figcaption>Unsharp masking steepens an edge and adds a dark and a bright overshoot.</figcaption>
</figure>

## How it works

1. Make a blurred copy of the image with a Gaussian blur.
2. Subtract the copy from the image. What is left is the fine detail.
3. Multiply the detail by the amount.
4. Add it back to the image, except where the detail is below the threshold.

## Mathematical foundation

--8<-- "filters/unsharp-mask-formula.md"

With threshold 0, the result I + a (I - G * I) equals (1 + a) I - a (G * I). That is correlation with a single kernel, so the filter is linear and boosts high frequencies. A threshold above 0 makes the filter nonlinear, because the choice depends on the size of the detail.

## Kernel or operator

The single equivalent kernel for sigma 0.6 and amount 1, from the filter code. The center weight is 1 + a minus a times the Gaussian center weight. The weights add up to 1.

--8<-- "kernels/unsharp-mask.md"

## Algorithm

--8<-- "filters/unsharp-mask-steps.md"

## Parameters

--8<-- "filters/unsharp-mask-params.md"

## Implementation

The blur uses the same Gaussian code as the Gaussian filter, with truncate 3. `unsharpKernel` builds the equivalent kernel for the Inspector. Results are clipped to 0 to 255, so strong settings can clip highlights and shadows. The filter runs in the browser engine, in Web Workers. The studio splits the image into strips. Each strip gets a halo as wide as the support radius, so the strips give exactly the pixels of a whole-image run. The shared filter framework in `web/src/core/filters/run.ts` handles the border mode, the channel scope, alpha and the final rounding to 8 bits.

## Worked example

--8<-- "examples/unsharp-mask.md"

## Complexity

--8<-- "filters/unsharp-mask-complexity.md"

## Artifacts and limitations

--8<-- "filters/unsharp-mask-limits.md"

## Tests

The filter is compared with a NumPy version of the same formula built on `scipy.ndimage.gaussian_filter`, for two settings and three border modes, within 1e-4 relative to the value. The fixture generator first checks that formula against `skimage.filters.unsharp_mask`.

--8<-- "filters/unsharp-mask-tests.md"

## References

--8<-- "filters/unsharp-mask-references.md"
