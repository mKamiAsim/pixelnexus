# Convolution and correlation

Many filters compute each output pixel as a weighted sum of the input pixels around it. The grid of weights is the **kernel**. This page explains how a kernel is applied, and the convention PixelNexus uses.

## Correlation

PixelNexus applies kernels by correlation, as OpenCV and `scipy.ndimage.correlate` do. This is an exact definition of what the code computes:

\[
I_{\text{out}}(x, y) = \sum_{j=-r}^{r} \sum_{i=-r}^{r} K(i, j)\, I(x + i,\, y + j)
\]

where

- \(K(i, j)\) is the kernel weight at offset \(i\) to the right and \(j\) down from the anchor.
- \(I(x + i, y + j)\) is the input value under that weight.
- \(r\) is the kernel radius. The kernel is \(2r + 1\) cells wide.

In words: lay the kernel on the image so that its anchor sits on the pixel. Multiply each weight by the pixel under it, and add the products.

The **anchor** is the kernel cell over the pixel being computed. For the odd-sized kernels in PixelNexus it is the center cell.

## Convolution

Convolution is the same operation with the kernel flipped in both directions:

\[
(K * I)(x, y) = \sum_{j=-r}^{r} \sum_{i=-r}^{r} K(i, j)\, I(x - i,\, y - j)
\]

where the symbols are the same as above. For a symmetric kernel, such as a Gaussian or a box, the two give the same result. For a kernel that is not symmetric, such as Sobel \(K_x\), the results have opposite signs. Mathematics books usually write convolution. Image libraries usually compute correlation. The Inspector shows the kernel as it is applied, and can show the flipped kernel for comparison.

## Normalized kernels

A kernel whose weights add up to 1 is **normalized**. It keeps a flat area at the same value, because the weighted sum of equal values is that value. Blur kernels are normalized. Derivative kernels, such as Sobel and the Laplacian, add up to 0. They give 0 on flat areas, which is the point of a derivative.

## Separable kernels

Some 2D kernels are the outer product of a column vector and a row vector:

\[
K(i, j) = c_j\, r_i
\]

where \(c\) is the column factor and \(r\) the row factor. Such a kernel is **separable**. The filter can then run one 1D pass along the rows with \(r\) and one along the columns with \(c\). For a window \(n\) pixels wide, this costs about \(2n\) multiplications per pixel instead of \(n^2\). The Gaussian, the box and the Sobel kernels are separable. The motion blur kernel at a slant is not.

## Kernels in the studio

The Inspector never stores a kernel by hand. Each filter has a function that builds its kernel from the current parameters. The filter runs that same function. A test checks for every kernel filter that correlating with the shown kernel gives the same output as the filter.
