# Harris corner detector

--8<-- "filters/harris-facts.md"

## Overview

The Harris corner detector finds the pixels where the brightness changes strongly in every direction. Such points can be found again in another view, so they are used for tracking, matching and alignment. The filter shows the Harris response at every pixel, or the corner points themselves.

<figure markdown="span">
  ![Three panels: a checkerboard, the Harris response with bright spots where four squares meet, and the corner points as nine white dots at those places.](../../assets/figures/harris-light.svg#only-light){ width="480" }
  ![Three panels: a checkerboard, the Harris response with bright spots where four squares meet, and the corner points as nine white dots at those places.](../../assets/figures/harris-dark.svg#only-dark){ width="480" }
  <figcaption>Harris on a checkerboard. The response peaks where four squares meet, and the corner points mark those peaks.</figcaption>
</figure>

## How it works

1. Compute the change in x and in y at every pixel.
2. Collect the squares and the product of the two changes in a Gaussian window. This is the structure tensor.
3. Score each pixel by det A - k (tr A)^2.
4. For corner points, keep the local maxima above the threshold.

## Mathematical foundation

--8<-- "filters/harris-formula.md"

Moving a small window across a flat area changes nothing. Along an edge, only moves across the edge change the window. At a corner, every move does. The structure tensor A sums the outer products of the gradient in the window, and its two eigenvalues measure the change in the strongest and weakest direction. Harris and Stephens avoided the eigenvalues with det A - k (tr A)^2. It is positive when both eigenvalues are large, negative when only one is, and near 0 when both are small.

## Kernel or operator

There is no single kernel. The Inspector lists the stages with the current sigma and k. The Sobel and Gaussian kernels are on their own pages.

## Algorithm

--8<-- "filters/harris-steps.md"

## Parameters

--8<-- "filters/harris-params.md"

## Implementation

`cornerResponse` in `web/src/core/filters/features/corners.ts` scales the plane to 0 to 1 and computes the Sobel derivatives. It blurs their products with a Gaussian cut at 4 sigma, as `skimage.feature.structure_tensor` does. The filter extends the plane once by the full support with the border mode, runs these stages and cuts the extension off. Then `cornerPeaks` keeps the pixels whose response is at least the threshold and the largest within the minimum distance. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/harris.md"

## Complexity

--8<-- "filters/harris-complexity.md"

## Artifacts and limitations

--8<-- "filters/harris-limits.md"

## Tests

The reference runs `scipy.ndimage.sobel` and `scipy.ndimage.gaussian_filter` on the extended plane and `scipy.ndimage.maximum_filter` for the peaks. Before the cases are written, the script checks the response against `skimage.feature.corner_harris` on a larger random image away from the border, where both border rules give the same values. It also checks that a bright square gives exactly four corner points, one next to each of its corners. The cases cover the response and the corner points for all five border modes.

--8<-- "filters/harris-tests.md"

## References

--8<-- "filters/harris-references.md"
