# Anisotropic diffusion

--8<-- "filters/anisotropic-diffusion-facts.md"

## Overview

Anisotropic diffusion smooths an image by letting values flow between neighbors, like heat. Unlike heat, the flow is blocked where the difference is large, at edges. After a number of steps, noise in flat areas has evened out while edges are still sharp. Perona and Malik proposed it in 1990, and it is also called Perona-Malik diffusion.

<figure markdown="span">
  ![Four panels in two rows: disks with Gaussian noise, the result after 5 iterations with less noise, after 20 iterations with flat areas and sharp edges, and a Gaussian blur with sigma 2 that blurs the edges.](../../assets/figures/anisotropic-diffusion-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with Gaussian noise, the result after 5 iterations with less noise, after 20 iterations with flat areas and sharp edges, and a Gaussian blur with sigma 2 that blurs the edges.](../../assets/figures/anisotropic-diffusion-dark.svg#only-dark){ width="480" }
  <figcaption>More iterations remove more noise. The disk edges stay sharp, unlike with a Gaussian blur.</figcaption>
</figure>

## How it works

1. Find the difference between each pixel and its four neighbors.
2. Turn each difference into a conduction: near 1 for small differences, near 0 for large ones.
3. Move the pixel toward its neighbors by the step size times the differences times their conductions.
4. Repeat for the chosen number of iterations.

## Mathematical foundation

--8<-- "filters/anisotropic-diffusion-formula.md"

With a constant conduction, the update is the heat equation, and many steps give a Gaussian blur. Perona and Malik let the conduction fall with the gradient, with one of two functions of the difference d and the edge threshold K. Where |d| is much larger than K, the flow stops, so edges are not smoothed. The explicit scheme with four neighbors is stable for step sizes up to 0.25. The reflect border is the zero-flux boundary of the paper: no value flows in or out of the image.

## Kernel or operator

The Inspector shows the update step with the current parameters and the number of iterations. The worked example below runs one step for one pixel.

## Algorithm

--8<-- "filters/anisotropic-diffusion-steps.md"

## Parameters

--8<-- "filters/anisotropic-diffusion-params.md"

## Implementation

`anisotropicDiffusionFilter` in `web/src/core/filters/nonlinear/diffusion.ts` extends the plane once by one pixel per iteration with the border mode, runs all steps in float64, and cuts the extension off. Information moves one pixel per step, so the extension holds every value a pixel can reach. For the reflect modes and wrap, this equals applying the border rule at every step. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/anisotropic-diffusion.md"

## Complexity

--8<-- "filters/anisotropic-diffusion-complexity.md"

## Artifacts and limitations

--8<-- "filters/anisotropic-diffusion-limits.md"

## Tests

The reference runs the same steps with NumPy on the extended plane. Before it is used, the script checks that extending once equals applying the mirror rule at every step. The test covers both conduction functions for all five border modes.

--8<-- "filters/anisotropic-diffusion-tests.md"

## References

--8<-- "filters/anisotropic-diffusion-references.md"
