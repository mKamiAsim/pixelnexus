# Laplacian sharpening

--8<-- "filters/laplacian-sharpen-facts.md"

## Overview

Laplacian sharpening subtracts a multiple of the [Laplacian](laplacian.md) from the image. The Laplacian measures how much a pixel differs from its neighbors, so subtracting it makes each difference larger. Edges get steeper and fine detail stands out. It is the smallest sharpening filter: one 3x3 kernel.

<figure markdown="span">
  ![A line plot across a soft edge, before and after Laplacian sharpening with c 0.5 and c 1. The sharpened curves are steeper, with a small dip on the dark side and a small peak on the bright side.](../../assets/figures/laplacian-sharpen-light.svg#only-light){ width="480" }
  ![A line plot across a soft edge, before and after Laplacian sharpening with c 0.5 and c 1. The sharpened curves are steeper, with a small dip on the dark side and a small peak on the bright side.](../../assets/figures/laplacian-sharpen-dark.svg#only-dark){ width="480" }
  <figcaption>Laplacian sharpening makes a soft edge steeper, with a small dip and peak beside it.</figcaption>
</figure>

## How it works

1. Compare each pixel with its neighbors. That is the Laplacian.
2. Multiply the Laplacian by the amount.
3. Subtract it from the pixel.

## Mathematical foundation

--8<-- "filters/laplacian-sharpen-formula.md"

The Laplacian with a negative center approximates \(\nabla^2 I\). Along a soft edge, \(\nabla^2 I\) is positive on the dark side and negative on the bright side. Subtracting it lowers the dark side and raises the bright side, so the edge gets steeper. Because the Laplacian kernel's weights add up to 0, the sharpening kernel's weights add up to 1, and flat areas keep their exact value.

## Kernel or operator

The kernels for 4 and 8 neighbors with \(c = 1\), from the filter code.

--8<-- "kernels/laplacian-sharpen.md"

## Algorithm

--8<-- "filters/laplacian-sharpen-steps.md"

## Parameters

--8<-- "filters/laplacian-sharpen-params.md"

## Implementation

`laplacianSharpenKernel` in `web/src/core/filters/linear/laplacian-sharpen.ts` builds the kernel from the Laplacian kernel in `laplacian.ts`, so both filters share one definition. The image is correlated with the kernel and the result is clipped.

## Worked example

--8<-- "examples/laplacian-sharpen.md"

## Complexity

--8<-- "filters/laplacian-sharpen-complexity.md"

## Artifacts and limitations

--8<-- "filters/laplacian-sharpen-limits.md"

## Tests

The test compares the filter with `scipy.ndimage.correlate` for both neighbor sets, two amounts and three border modes. The fixture script first checks the kernel against \(I - c\) times `scipy.ndimage.laplace`.

--8<-- "filters/laplacian-sharpen-tests.md"

## References

--8<-- "filters/laplacian-sharpen-references.md"
