# Gaussian pyramid filtering

--8<-- "filters/gaussian-pyramid-facts.md"

## Overview

Gaussian pyramid filtering shrinks the image to half size a few times and expands it back to full size. Each shrink step blurs a little and keeps every second pixel. Only the detail that the smallest level can hold survives, so the result is a low-pass image. It shows what one level of a Gaussian pyramid contains, and it is the first step toward the Laplacian pyramid.

<figure markdown="span">
  ![Three panels: a zone plate with rings that get finer toward the edges, the result with 1 level where the finest rings fade, and the result with 2 levels where only the center spot and the first ring remain.](../../assets/figures/gaussian-pyramid-light.svg#only-light){ width="480" }
  ![Three panels: a zone plate with rings that get finer toward the edges, the result with 1 level where the finest rings fade, and the result with 2 levels where only the center spot and the first ring remain.](../../assets/figures/gaussian-pyramid-dark.svg#only-dark){ width="480" }
  <figcaption>Gaussian pyramid filtering of a zone plate with 1 and 2 levels.</figcaption>
</figure>

## How it works

1. Blur the image with the 5 by 5 kernel w along rows and columns.
2. Keep every second pixel in each direction, starting with the first.
3. Repeat for the chosen number of levels.
4. Expand the smallest level back to the size of the level below, again and again, until it has the size of the image.

## Mathematical foundation

--8<-- "filters/gaussian-pyramid-formula.md"

A Gaussian pyramid holds the image at a series of sizes, each half as wide and half as tall as the one before. REDUCE blurs with a small kernel before it drops every second pixel. So most detail too fine for the smaller grid is removed first, which keeps aliasing low. EXPAND fills the dropped pixels back in by interpolation. Burt and Adelson chose the kernel w by a few rules. It is symmetric and adds up to 1. Also, every pixel of a level gives the same total weight to the level above. The filter is linear but not shift invariant. The worked example shows why.

## Kernel or operator

The Inspector shows the stages of the pyramid as formulas. They are the REDUCE step with the kernel w = [1, 4, 6, 4, 1] / 16, the EXPAND step, and the number of levels.

## Algorithm

--8<-- "filters/gaussian-pyramid-steps.md"

## Parameters

--8<-- "filters/gaussian-pyramid-params.md"

## Implementation

`gaussianPyramidFilter` in `web/src/core/filters/multiscale/pyramid.ts` builds the levels with `gaussianPyramid` and expands the top level with `expand`. REDUCE and EXPAND run along rows, then columns. On a large image at low zoom, the preview runs on a smaller copy, and the number of levels drops by one for each halving of the size.

## Worked example

--8<-- "examples/gaussian-pyramid.md"

## Complexity

--8<-- "filters/gaussian-pyramid-complexity.md"

## Artifacts and limitations

--8<-- "filters/gaussian-pyramid-limits.md"

## Tests

The reference builds the same REDUCE and EXPAND with NumPy, pixel by pixel, and covers 1 to 3 levels and three border modes. More tests check the level sizes, that a flat image stays flat, and that a shift of the input by one pixel changes the response by more than a shift.

--8<-- "filters/gaussian-pyramid-tests.md"

## References

--8<-- "filters/gaussian-pyramid-references.md"
