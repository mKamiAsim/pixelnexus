# Computational complexity

The **complexity** of a filter says how its running time and memory grow with the image and its parameters. Every filter page gives it, from the catalog. This page explains the common cases. \(N\) is the number of pixels and \(k\) the window width.

## Common costs

| Method | Time | Example |
|---|---|---|
| Point operation | \(O(N)\) | brightness, gamma, invert |
| 2D kernel, computed directly | \(O(N k^2)\) | weighted average with a custom kernel |
| Separable kernel | \(O(N k)\) | Gaussian, as two 1D passes |
| Running sums | \(O(N)\), any window size | box filter |
| Sliding histogram | \(O(N k)\) | median filter (Huang, Yang and Tang) |
| FFT filtering | \(O(N \log N)\) | frequency filters |
| Window with weights per pixel | \(O(N k^2)\) | bilateral filter, nonlocal means |

## Separable kernels

A kernel is **separable** when it is the outer product of a column and a row, \(K = c\, r^T\). Then filtering with \(K\) equals filtering with \(r\) along the rows and \(c\) along the columns, \(2k\) multiplications per pixel instead of \(k^2\). The Gaussian kernel is separable, so its cost grows with \(\sigma\), not with \(\sigma^2\).

## When the window gets large

Direct 2D kernels grow with the square of the window. For large kernels the FFT is cheaper, since its cost does not depend on the kernel size. Running sums make the box filter cost the same for any window.

## Measured times

Big-O shows growth, not seconds. The [performance page](../architecture/performance.md) has measured times for twelve filters on a 4096 x 4096 image, and explains the benchmark script that produced them.
