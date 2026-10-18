# Local Laplacian filtering

--8<-- "filters/local-laplacian-facts.md"

## Overview

Local Laplacian filtering, by Paris, Hasinoff and Kautz, raises or lowers fine detail without halos at strong edges. It can also compress the edges themselves. It works on a Laplacian pyramid, the stack of detail layers that the [Laplacian pyramid](../multiscale/laplacian-pyramid.md) page explains. The trick is that each coefficient comes from the image remapped around the local brightness at that place and scale. Small differences from it count as detail, and large ones as edges. PixelNexus computes it with the fast algorithm of Aubry et al. The filter runs in the PixelNexus engine.

<figure markdown="span">
  ![Four panels. The input has a dark left half and a light right half, both with a faint checked texture. With alpha 0.25, the texture becomes strong dots and diamonds on both halves, and the edge between the halves stays sharp with no bright or dark band. With alpha 4, both halves are flat and smooth, and the edge stays sharp. With beta 0.3, the texture looks as in the input, and the edge is a little softer, with a darker band right next to it.](../../assets/figures/local-laplacian-light.svg#only-light){ width="480" }
  ![Four panels. The input has a dark left half and a light right half, both with a faint checked texture. With alpha 0.25, the texture becomes strong dots and diamonds on both halves, and the edge between the halves stays sharp with no bright or dark band. With alpha 4, both halves are flat and smooth, and the edge stays sharp. With beta 0.3, the texture looks as in the input, and the edge is a little softer, with a darker band right next to it.](../../assets/figures/local-laplacian-dark.svg#only-dark){ width="480" }
  <figcaption>A dark and a bright half with the same fine texture. Then local Laplacian filtering with sigma r 0.3 and alpha 0.25, alpha 4, and alpha 1 with beta 0.3.</figcaption>
</figure>

## How it works

--8<-- "filters/local-laplacian-steps.md"

## Mathematical foundation

--8<-- "filters/local-laplacian-formula.md"

A plain Laplacian pyramid mixes detail and edges at every level. If you boost a level, you boost the edges in it too, and halos appear. Paris et al. avoid this with a remapping that depends on g, the local brightness from the Gaussian pyramid. Around g, values within sigma r are details and pass through f_d. Values further away are edges and pass through f_e. With f_e as the identity, an edge keeps its size, so the coefficient that describes it barely changes.

Done exactly, each coefficient needs its own remapped image and pyramid. Aubry et al. noticed that the remapping changes smoothly with g. So they remap the whole image for a few values of g and build one pyramid for each. Each coefficient is then interpolated between the two pyramids whose g values bracket the local one.

## Kernel or operator

The pyramids use the 5 x 5 kernel of Burt and Adelson. The filter as a whole has no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/local-laplacian-params.md"

## Implementation

`local_laplacian` in `engine/src/pixelnexus_engine/filters/local_laplacian.py` works on the intensity (20 R + 40 G + B) / 61 and keeps the color ratios, as Paris et al. do for tone manipulation. It builds the pyramids with OpenCV's `pyrDown` and `pyrUp`. The number of levels is floor(log2 of the shorter side) minus 2, our choice. The coarsest level, the low-pass residual, comes from the Gaussian pyramid of the intensity, also our choice. For alpha below 1, the paper blends f_d back to x for differences under 1 to 2 percent of the full range, to keep noise from growing. It calls this blend a smooth step without giving its shape. We use the cubic smoothstep.

## Worked example

--8<-- "examples/local-laplacian.md"

Alpha 0.25 makes the texture about four times stronger on both sides, while the step between the halves stays near 130. The brightest pixel next to the edge stays below the brightest pixel of the bright side, so no halo forms. Alpha 4 almost removes the texture and keeps the edge. Beta 0.3 changes the step only from 130 to 123.5. Most of a step this wide lives in the coarsest level, which the filter keeps as it is. So only the fine levels near the edge are compressed, which leaves a darker band right of the edge. Paris et al. compress edges this way on log intensities of HDR images, where large changes span many levels.

## Complexity

--8<-- "filters/local-laplacian-complexity.md"

## Artifacts and limitations

--8<-- "filters/local-laplacian-limits.md"

## Tests

The remapping must give the detail and edge values of the paper, leave differences under 1 percent alone when alpha is below 1, and be monotonic and continuous. The pyramid must collapse back to the image, and alpha 1 with beta 1 must leave the image as it is. On a small image, the fast algorithm must come within 30 dB of a direct version of Algorithm 1 with 8 samples, and within 35 dB with 16. On a textured step, a low alpha must raise the texture, a high alpha lower it, and no halo may pass the texture of the bright side. Beta below 1 must compress a step near the edge. The color ratios and the alpha must be kept.

--8<-- "filters/local-laplacian-tests.md"

## References

--8<-- "filters/local-laplacian-references.md"
