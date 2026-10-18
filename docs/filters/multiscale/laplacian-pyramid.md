# Laplacian pyramid filtering

--8<-- "filters/laplacian-pyramid-facts.md"

## Overview

Laplacian pyramid filtering splits the image into detail levels of growing size and a small coarse image. Each detail level holds the detail that one REDUCE step removed. The filter multiplies the first four detail levels by their gains and adds everything back. Gains above 1 boost detail of that size, gains below 1 soften it, and gains of 1 give the image back exactly.

<figure markdown="span">
  ![Three panels: a Siemens star, the result with gains 0, 0, 1, 1 where the fine spokes near the center blur, and the result with gains 1, 1, 2, 2 where the spokes have stronger contrast.](../../assets/figures/laplacian-pyramid-light.svg#only-light){ width="480" }
  ![Three panels: a Siemens star, the result with gains 0, 0, 1, 1 where the fine spokes near the center blur, and the result with gains 1, 1, 2, 2 where the spokes have stronger contrast.](../../assets/figures/laplacian-pyramid-dark.svg#only-dark){ width="480" }
  <figcaption>Laplacian pyramid filtering of a Siemens star with 4 levels and two sets of gains.</figcaption>
</figure>

## How it works

1. Build a Gaussian pyramid with the chosen number of levels.
2. For each level, expand the level above and subtract it. The difference is a detail level.
3. Start with the top level of the Gaussian pyramid.
4. Expand it, and add the detail level of that size times its gain.
5. Repeat down to full size.

## Mathematical foundation

--8<-- "filters/laplacian-pyramid-formula.md"

A Gaussian pyramid holds the image at a series of sizes, each half as wide and half as tall as the one before. REDUCE blurs with a small kernel before it drops every second pixel. So most detail too fine for the smaller grid is removed first, which keeps aliasing low. EXPAND fills the dropped pixels back in by interpolation. Burt and Adelson chose the kernel w by a few rules. It is symmetric and adds up to 1. Also, every pixel of a level gives the same total weight to the level above. Burt and Adelson take the difference of each level and the expanded level above, the Laplacian pyramid. Each detail level is a band-pass image, about one octave of sizes. The rebuild reverses the subtraction, so with all gains 1 every step cancels and the image comes back exactly. A gain changes one band only, which makes the pyramid a simple tool to change detail by size.

## Kernel or operator

The Inspector shows the stages of the pyramid as formulas. They are the REDUCE step with the kernel w = [1, 4, 6, 4, 1] / 16, the EXPAND step, and the number of levels. It also shows the detail levels L_k and the rebuild with the current gains.

## Algorithm

--8<-- "filters/laplacian-pyramid-steps.md"

## Parameters

--8<-- "filters/laplacian-pyramid-params.md"

## Implementation

`laplacianPyramidFilter` in `web/src/core/filters/multiscale/pyramid.ts` builds the levels with `gaussianPyramid` and rebuilds them with `laplacianRebuild`. Detail levels above the fourth keep gain 1. On a large image at low zoom, the preview runs on a smaller copy, and the number of levels drops by one for each halving of the size.

## Worked example

--8<-- "examples/laplacian-pyramid.md"

## Complexity

--8<-- "filters/laplacian-pyramid-complexity.md"

## Artifacts and limitations

--8<-- "filters/laplacian-pyramid-limits.md"

## Tests

The reference builds the same pyramid and rebuild with NumPy and covers three sets of gains and three border modes. More tests check that gains of 1 give the image back for all five border modes and that a flat image stays flat.

--8<-- "filters/laplacian-pyramid-tests.md"

## References

--8<-- "filters/laplacian-pyramid-references.md"
