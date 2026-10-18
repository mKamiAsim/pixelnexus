# Multiresolution diffusion

--8<-- "filters/multires-diffusion-facts.md"

## Overview

[Anisotropic diffusion](../nonlinear/anisotropic-diffusion.md) smooths flat areas and keeps edges, but each step moves information by only one pixel. Noise that forms wide blotches needs many steps before it goes. Multiresolution diffusion runs the diffusion on a Gaussian pyramid instead. A step at a level halved three times moves information by 8 pixels of the image. The coarse levels remove the wide blotches in a few steps, and each finer level refines the result near edges.

Definitions of multiresolution diffusion differ between papers. This is a documented variant of PixelNexus, close in idea to the multigrid anisotropic diffusion of Acton.

<figure markdown="span">
  ![Three panels: the Disks and dots test image with wide gray blotches of noise, the result of 10 diffusion steps on the image, still blotchy, and of 10 steps on each of 4 levels, with a clean background and sharp disks. The smallest dots are a little fainter.](../../assets/figures/multires-diffusion-light.svg#only-light){ width="480" }
  ![Three panels: the Disks and dots test image with wide gray blotches of noise, the result of 10 diffusion steps on the image, still blotchy, and of 10 steps on each of 4 levels, with a clean background and sharp disks. The smallest dots are a little fainter.](../../assets/figures/multires-diffusion-dark.svg#only-dark){ width="480" }
  <figcaption>On wide blotches of noise, 10 steps on one level barely help. 10 steps on each of 4 levels remove most of them.</figcaption>
</figure>

## How it works

1. Shrink the image a few times by half, with the Gaussian pyramid.
2. Smooth the smallest copy with anisotropic diffusion, which keeps its edges.
3. Enlarge the change that the smoothing made, add it to the next larger copy, and smooth that.
4. Repeat up to the full size.

## Mathematical foundation

--8<-- "filters/multires-diffusion-formula.md"

The change u_(k+1) - G_(k+1) carries the smoothing of a coarse level to the next one. Adding it to G_k, and not the coarse result itself, keeps the fine detail of G_k that the coarse level never had. The diffusion at level k then works from a start that is already smooth at large scales, so it only has to clean up near edges and fine structure.

## Kernel or operator

There is no fixed kernel. The conduction depends on the local differences. The Inspector shows the pyramid and the steps with the current values.

## Algorithm

--8<-- "filters/multires-diffusion-steps.md"

## Parameters

--8<-- "filters/multires-diffusion-params.md"

## Implementation

`multiresDiffusion` in `web/src/core/filters/multiscale/multires-diffusion.ts` builds the pyramid with `gaussianPyramid` from the Gaussian pyramid filter and diffuses with `diffuse` from the anisotropic diffusion filter, so both parts are the tested code of those filters. Each diffusion repeats the edge of its level, the zero-flux boundary. The whole image is needed for the pyramid, so the filter runs on the whole image at once.

## Worked example

--8<-- "examples/multires-diffusion.md"

The multiresolution result beats 40 plain steps, although its 40 steps are spread over four levels. The three coarse levels together cost less than one level of the full size.

## Complexity

--8<-- "filters/multires-diffusion-complexity.md"

## Artifacts and limitations

--8<-- "filters/multires-diffusion-limits.md"

## Tests

A NumPy version in `tools/fixtures_multires.py` gives the reference for 0, 2 and 3 levels, both conduction functions and three border modes. It builds the pyramid with the checked reference of the Gaussian pyramid filter. Before it is used, the script checks its diffusion steps: with a huge K they must equal repeated convolution with the heat equation stencil in SciPy.

--8<-- "filters/multires-diffusion-tests.md"

## References

--8<-- "filters/multires-diffusion-references.md"
