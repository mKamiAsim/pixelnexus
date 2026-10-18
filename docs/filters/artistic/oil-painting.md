# Oil-painting effect

--8<-- "filters/oil-painting-facts.md"

## Overview

The oil-painting effect turns each pixel into the average color of the brightness that most of its neighbors share. Small details vanish into flat patches, while strong edges stay, which looks like daubs of paint.

<figure markdown="span">
  ![Two panels: a test scene with a blue sky, green ground and red, yellow and blue disks, and the oil painting version with flat patches and kept edges.](../../assets/figures/oil-painting-light.svg#only-light){ width="480" }
  ![Two panels: a test scene with a blue sky, green ground and red, yellow and blue disks, and the oil painting version with flat patches and kept edges.](../../assets/figures/oil-painting-dark.svg#only-dark){ width="480" }
  <figcaption>A test scene, and the oil painting effect with radius 3 and 20 levels.</figcaption>
</figure>

## How it works

1. Sort the luma of the pixels into equal bins.
2. In the window around each pixel, find the most common bin.
3. Output the mean color of the window pixels in that bin.

## Mathematical foundation

--8<-- "filters/oil-painting-formula.md"

The most common bin is the mode of a coarse histogram of the window. Near an edge, the window holds two groups of brightness, and the larger group wins. So the edge stays where it was, but each side becomes flat. The window slides along each row: one column leaves and one enters, so each step costs one column of the window.

## Kernel or operator

The Inspector shows the steps of the effect as formulas with the current settings.

## Algorithm

--8<-- "filters/oil-painting-steps.md"

## Parameters

--8<-- "filters/oil-painting-params.md"

## Implementation

`oilPaintingFilter` in `web/src/core/filters/artistic/painterly.ts` uses `oilPaint`, which keeps the count and the color sums of each bin as the window slides.

## Worked example

--8<-- "examples/oil-painting.md"

## Complexity

--8<-- "filters/oil-painting-complexity.md"

## Artifacts and limitations

--8<-- "filters/oil-painting-limits.md"

## Tests

The reference writes the window rule again with NumPy and SciPy, and compares every output value on the test images of the fixtures. Before the cases are written, the script checks that no luma value lies on a bin edge, where 32-bit and 64-bit floats could disagree. A unit test checks that a flat image stays flat.

--8<-- "filters/oil-painting-tests.md"

## References

--8<-- "filters/oil-painting-references.md"
