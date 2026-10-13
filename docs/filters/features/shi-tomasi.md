# Shi-Tomasi

--8<-- "filters/shi-tomasi-facts.md"

## Overview

The Shi-Tomasi detector finds corners by the smaller eigenvalue of the structure tensor. Shi and Tomasi chose it as the measure of a good feature to track: a window can be followed well only when the brightness changes in every direction. The filter shows the measure at every pixel, or the corner points themselves.

<figure markdown="span">
  ![Three panels: a checkerboard, the Shi-Tomasi response with bright spots where four squares meet, and the corner points as nine white dots at those places.](../../assets/figures/shi-tomasi-light.svg#only-light){ width="480" }
  ![Three panels: a checkerboard, the Shi-Tomasi response with bright spots where four squares meet, and the corner points as nine white dots at those places.](../../assets/figures/shi-tomasi-dark.svg#only-dark){ width="480" }
  <figcaption>Shi-Tomasi on a checkerboard. The response peaks where four squares meet, and the corner points mark those peaks.</figcaption>
</figure>

## How it works

1. Compute the change in x and in y at every pixel.
2. Collect the squares and the product of the two changes in a Gaussian window. This is the structure tensor.
3. Score each pixel by the smaller eigenvalue of the tensor.
4. For corner points, keep the local maxima above the threshold.

## Mathematical foundation

--8<-- "filters/shi-tomasi-formula.md"

The structure tensor A has two eigenvalues. The larger one measures the change in the strongest direction, and the smaller one the change in the weakest direction. At a corner both are large, along an edge only the larger one is, and in a flat area both are small. So the smaller eigenvalue alone separates corners from the rest. Unlike Harris, it needs no extra parameter.

## Kernel or operator

There is no single kernel. The Inspector lists the stages with the current sigma. The Sobel and Gaussian kernels are on their own pages.

## Algorithm

--8<-- "filters/shi-tomasi-steps.md"

## Parameters

--8<-- "filters/shi-tomasi-params.md"

## Implementation

`cornerResponse` in `web/src/core/filters/features/corners.ts` scales the plane to 0 to 1 and computes the Sobel derivatives. It blurs their products with a Gaussian cut at 4 sigma, as `skimage.feature.structure_tensor` does. The filter extends the plane once by the full support with the border mode, runs these stages and cuts the extension off. Then `cornerPeaks` keeps the pixels whose response is at least the threshold and the largest within the minimum distance. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/shi-tomasi.md"

## Complexity

--8<-- "filters/shi-tomasi-complexity.md"

## Artifacts and limitations

--8<-- "filters/shi-tomasi-limits.md"

## Tests

The reference runs `scipy.ndimage.sobel` and `scipy.ndimage.gaussian_filter` on the extended plane and `scipy.ndimage.maximum_filter` for the peaks. Before the cases are written, the script checks the response against `skimage.feature.corner_shi_tomasi` on a larger random image away from the border, where both border rules give the same values. It also checks that a bright square gives exactly four corner points, one next to each of its corners. The cases cover the response and the corner points for all five border modes.

--8<-- "filters/shi-tomasi-tests.md"

## References

--8<-- "filters/shi-tomasi-references.md"
