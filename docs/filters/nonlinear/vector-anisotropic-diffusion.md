# Vector anisotropic diffusion

--8<-- "filters/vector-anisotropic-diffusion-facts.md"

## Overview

Vector anisotropic diffusion is the color version of anisotropic diffusion. Instead of a separate conduction for each channel, all channels share one conduction from the length of the color difference. An edge in any channel blocks the flow in all three, so edges stay in the same place in every channel, and colors do not bleed into each other.

<figure markdown="span">
  ![Three panels: a noisy hue sweep, the result of per-channel anisotropic diffusion, and the result of vector anisotropic diffusion. Both remove the noise.](../../assets/figures/vector-anisotropic-diffusion-light.svg#only-light){ width="480" }
  ![Three panels: a noisy hue sweep, the result of per-channel anisotropic diffusion, and the result of vector anisotropic diffusion. Both remove the noise.](../../assets/figures/vector-anisotropic-diffusion-dark.svg#only-dark){ width="480" }
  <figcaption>Both remove the noise. The vector version stops at the same place in all channels.</figcaption>
</figure>

## How it works

1. Find the color difference between each pixel and its four neighbors.
2. Turn the length of each color difference into one conduction for all channels.
3. Move each channel toward the neighbors by the step size times the differences times the conductions.
4. Repeat for the chosen number of iterations.

## Mathematical foundation

--8<-- "filters/vector-anisotropic-diffusion-formula.md"

Sapiro and Ringach treat a color image as a vector-valued image and let the diffusion depend on the norm of the vector gradient. In the discrete form here, the norm of the difference to each neighbor is the Euclidean distance between the two colors. For a gray image, that distance is the square root of 3 times the gray difference. So the same edge needs a K that is the square root of 3 times larger than in the scalar version.

## Kernel or operator

The Inspector shows the update step with the shared conduction. The worked example below runs one step for a red pixel next to a green one.

## Algorithm

--8<-- "filters/vector-anisotropic-diffusion-steps.md"

## Parameters

--8<-- "filters/vector-anisotropic-diffusion-params.md"

## Implementation

`vectorAnisotropicDiffusionFilter` in `web/src/core/filters/nonlinear/diffusion.ts` shares the step code with the scalar version, with one conduction for the three planes. The extension by one pixel per iteration works the same way. It is a color filter: the framework in `web/src/core/filters/run.ts` hands it the red, green and blue planes together, with the border mode, and keeps alpha. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/vector-anisotropic-diffusion.md"

## Complexity

--8<-- "filters/vector-anisotropic-diffusion-complexity.md"

## Artifacts and limitations

--8<-- "filters/vector-anisotropic-diffusion-limits.md"

## Tests

The reference runs the same steps with NumPy. Before it is used, the script checks that on a gray image it equals the scalar version with K divided by the square root of 3. The test compares the filter on a color input for all five border modes.

--8<-- "filters/vector-anisotropic-diffusion-tests.md"

## References

--8<-- "filters/vector-anisotropic-diffusion-references.md"
