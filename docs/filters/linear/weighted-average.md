# Weighted average filter

--8<-- "filters/weighted-average-facts.md"

## Overview

The weighted average filter runs a kernel that you type. Each pixel becomes the weighted sum of its neighbors, with your weights. It is the general linear filter: every blur, sharpening and edge kernel in a textbook can be tried here, up to 15x15.

<figure markdown="span">
  ![Three panels: a Siemens star, the star after the blur kernel 1 2 1; 2 4 2; 1 2 1, and after the vertical edge kernel -1 0 1; -2 0 2; -1 0 1 with the absolute value. The blur softens the spokes. The edge kernel shows white lines at the spoke edges.](../../assets/figures/weighted-average-light.svg#only-light){ width="480" }
  ![Three panels: a Siemens star, the star after the blur kernel 1 2 1; 2 4 2; 1 2 1, and after the vertical edge kernel -1 0 1; -2 0 2; -1 0 1 with the absolute value. The blur softens the spokes. The edge kernel shows white lines at the spoke edges.](../../assets/figures/weighted-average-dark.svg#only-dark){ width="480" }
  <figcaption>The same image through a blur kernel and through an edge kernel.</figcaption>
</figure>

## How it works

1. Type the weights, one row per line, or rows separated by semicolons.
2. Lay the kernel over the image with its center on the pixel.
3. Multiply each neighbor by the weight on top of it and add the results.
4. With **Normalize** on, divide by the sum of the weights.

## Mathematical foundation

--8<-- "filters/weighted-average-formula.md"

This is discrete correlation. Every linear, shift-invariant filter with a finite window has this form, so this one filter covers the whole linear family. The kernel is used as typed, not flipped. For a symmetric kernel, correlation and convolution give the same result. For other kernels, flip the kernel in both directions to get convolution.

When the weights add up to 1, flat areas keep their value. When they add up to 0, as in edge kernels, flat areas become 0 and the result is signed. Then turn **Normalize** off and pick an output mapping such as the absolute value.

## Kernel or operator

The default kernel, from the filter code.

--8<-- "kernels/weighted-average.md"

## Algorithm

--8<-- "filters/weighted-average-steps.md"

## Parameters

--8<-- "filters/weighted-average-params.md"

## Implementation

`parseKernel` in `web/src/core/filters/linear/weighted-average.ts` reads the text. When it cannot, it says why:

- the kernel is empty,
- the rows have different lengths,
- a side is even or above 15,
- a value is not a number.

The Properties panel shows that message under the text box, and keeps the last good kernel until the text can be read. The image is correlated with the shared 2D code.

## Worked example

--8<-- "examples/weighted-average.md"

## Complexity

--8<-- "filters/weighted-average-complexity.md"

## Artifacts and limitations

--8<-- "filters/weighted-average-limits.md"

## Tests

The test compares the filter with `scipy.ndimage.correlate` for four kernels, including a 3x5 kernel and a kernel whose weights add up to 0, for three border modes. The fixture script checks the Sobel-shaped kernel against `scipy.ndimage.sobel`. Unit tests cover the kernel text rules and their messages.

--8<-- "filters/weighted-average-tests.md"

## References

--8<-- "filters/weighted-average-references.md"
