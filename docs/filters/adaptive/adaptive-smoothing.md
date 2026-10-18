# Adaptive smoothing

--8<-- "filters/adaptive-smoothing-facts.md"

## Overview

Adaptive smoothing repeats a small weighted average. In each step, every pixel of the 3x3 window is weighted by how flat the image is at that pixel. Pixels on an edge have a large gradient and get almost no weight, so the averages on the two sides of an edge do not mix. After a number of steps, regions are smooth and their borders are still sharp.

<figure markdown="span">
  ![Three panels: disks with Gaussian noise, the result after 5 steps with less noise, and after 20 steps with flat disks and sharp edges.](../../assets/figures/adaptive-smoothing-light.svg#only-light){ width="480" }
  ![Three panels: disks with Gaussian noise, the result after 5 steps with less noise, and after 20 steps with flat disks and sharp edges.](../../assets/figures/adaptive-smoothing-dark.svg#only-dark){ width="480" }
  <figcaption>More steps flatten the noise inside the disks. The edges stay where they are.</figcaption>
</figure>

## How it works

1. Compute the gradient at every pixel from central differences.
2. Turn each gradient into a weight that is near 1 for small gradients and near 0 for large ones.
3. Replace each pixel by the weighted mean of its 3x3 window, and repeat.

## Mathematical foundation

--8<-- "filters/adaptive-smoothing-formula.md"

Saint-Marc, Chen and Medioni weight each pixel by exp(-|G|^2 / (2 k^2)). A step is a normalized convolution with data-dependent weights, close in spirit to anisotropic diffusion. With a very large k all weights are 1, and each step is a 3x3 box mean, so many steps give a Gaussian blur. With a finite k the smoothing stops at edges, and many steps give flat regions with sharp borders.

## Kernel or operator

The Inspector shows the update step with the current k and the number of iterations. The worked example below computes the weights for one pixel next to an edge.

## Algorithm

--8<-- "filters/adaptive-smoothing-steps.md"

## Parameters

--8<-- "filters/adaptive-smoothing-params.md"

## Implementation

`adaptiveSmoothingStep` in `web/src/core/filters/adaptive/adaptive-smoothing.ts` computes the weights of a whole plane, then the weighted means. Each step reads two pixels around each pixel, one for the gradient and one for the mean. So the plane is extended once by two pixels per step with the border mode, all steps run, and the frame is cut off. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/adaptive-smoothing.md"

## Complexity

--8<-- "filters/adaptive-smoothing-complexity.md"

## Artifacts and limitations

--8<-- "filters/adaptive-smoothing-limits.md"

## Tests

The reference runs the same steps with NumPy on the extended plane. Before it is used, the script checks that a huge k gives a repeated 3x3 box mean. The test covers two settings for all five border modes.

--8<-- "filters/adaptive-smoothing-tests.md"

## References

--8<-- "filters/adaptive-smoothing-references.md"
