# Mathematical foundations

These pages explain the ideas that every filter page builds on. Read them once. The filter pages then only explain what is special about each filter.

| Page | What it covers |
|---|---|
| [Image representation](image-representation.md) | How an image becomes numbers, channels and planes. |
| [Convolution and correlation](convolution-and-correlation.md) | Kernels, anchors, and why PixelNexus applies kernels without flipping them. |
| [Boundary conditions](boundary-conditions.md) | What a filter reads when its window reaches past the image edge. |
| [Linearity and superposition](linearity-and-superposition.md) | Which filters are linear, and what that means in practice. |
| [Masks and alpha blending](masks-and-alpha-blending.md) | How a result is blended through a selection, and how transparency is handled. |
| [Numerical precision](numerical-precision.md) | Floats inside, 8 bits outside, and where rounding happens. |

## Notation

- \(I(x, y)\) is the value of one channel at column \(x\) and row \(y\). \(x\) grows to the right and \(y\) grows downward, starting at 0 in the top left corner.
- \(I_{\text{out}}\) is the result of a filter.
- \(W\) and \(H\) are the image width and height in pixels. \(N = W H\) is the number of pixels.
- \(K(i, j)\) is a kernel weight at offset \(i\) to the right and \(j\) down from the anchor.
- \(r\) is a radius in pixels. A window of radius \(r\) is \(2r + 1\) pixels wide.
