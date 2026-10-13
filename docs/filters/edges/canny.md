# Canny

--8<-- "filters/canny-facts.md"

## Overview

The Canny edge detector is the classic way to find thin, connected edges. It blurs the image, computes the gradient, thins the gradient to lines one pixel wide, and keeps edges with two thresholds and hysteresis. Each of the five stages can be shown on its own with the Stage parameter, or side by side in the Stage viewer.

<figure markdown="span">
  ![Six panels: noisy bright disks, the smoothed image, the gradient magnitude with wide rings, the thinned rings, the double threshold with strong pixels white and weak pixels gray, and the final edges as thin clean circles.](../../assets/figures/canny-light.svg#only-light){ width="480" }
  ![Six panels: noisy bright disks, the smoothed image, the gradient magnitude with wide rings, the thinned rings, the double threshold with strong pixels white and weak pixels gray, and the final edges as thin clean circles.](../../assets/figures/canny-dark.svg#only-dark){ width="480" }
  <figcaption>The five stages of Canny on noisy disks: blur, gradient magnitude, thinning, double threshold and hysteresis.</figcaption>
</figure>

## How it works

1. Blur the image with a Gaussian to remove noise.
2. Compute the Sobel gradient: its magnitude and its direction.
3. Keep the magnitude only where it peaks across the edge.
4. Mark strong pixels above the high threshold and weak pixels above the low one.
5. Keep strong pixels and the weak pixels joined to them.

## Mathematical foundation

--8<-- "filters/canny-formula.md"

Canny set out three goals for an edge detector: find real edges and few false ones, place them close to the true edge, and give one response per edge. He showed that the derivative of a Gaussian is a good, simple answer for step edges. The blur and the derivative are done here as a Gaussian followed by the Sobel kernels. Thinning gives the single response, and hysteresis keeps edges connected without keeping noise. The thinning step keeps both pixels of a flat-topped ridge, so a perfectly symmetric step gives an edge two pixels wide.

## Kernel or operator

There is no single kernel. The Inspector lists the five stages with their formulas and the current parameters. The Gaussian and Sobel kernels are on their own pages.

## Algorithm

--8<-- "filters/canny-steps.md"

## Parameters

--8<-- "filters/canny-params.md"

## Implementation

`cannyStage` in `web/src/core/filters/edges/hysteresis.ts` extends the plane by floor(4 sigma + 0.5) + 2 pixels with the border mode, then runs the blur, the Sobel gradient and the suppression of `web/src/core/filters/edges/nms.ts`. It cuts the extension off before the thresholds and hysteresis with 8 neighbors, so edges never join through it. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope, alpha and the output mapping. It is a global filter. A path can cross the whole image, so the filter always runs on the whole image in one tile. A selection is cut out of the result. By default it works on luma.

## Worked example

--8<-- "examples/canny.md"

## Complexity

--8<-- "filters/canny-complexity.md"

## Artifacts and limitations

--8<-- "filters/canny-limits.md"

## Tests

The reference runs `scipy.ndimage.gaussian_filter` and `scipy.ndimage.sobel` on the extended plane, the same four-sector rule as Sobel with non-maximum suppression, and `scipy.ndimage.label` for hysteresis. Before the cases are written, the script checks that a step edge is marked on the two columns next to the step and nowhere else. The test covers every stage, both norms and all five border modes.

--8<-- "filters/canny-tests.md"

## References

--8<-- "filters/canny-references.md"
