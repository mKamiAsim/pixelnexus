# Linearity and superposition

A filter \(F\) is **linear** when, for any two images \(A\) and \(B\) and any numbers \(a\) and \(b\),

\[
F(a A + b B) = a\, F(A) + b\, F(B)
\]

where \(a A + b B\) means the image whose pixels are \(a\) times the pixels of \(A\) plus \(b\) times the pixels of \(B\).

In words: filtering a sum gives the sum of the filtered parts. This is the **superposition** principle.

## Why it matters

- **A kernel says everything.** A linear filter that treats every position the same way is a correlation with one kernel. Its response to a single bright pixel, the impulse response, is that kernel. The Impulse response demo in the Learn panel shows it.
- **The order of linear filters does not matter.** A Gaussian blur and then a box blur give the same result as the other order. Only pixels near the border can differ.
- **Frequencies stay separate.** A linear filter changes the strength of each spatial frequency but never creates a new one. The frequency filters of Phase 5e build on this.

## Linear and nonlinear filters in Phase 3

| Filter | Linear | Why |
|---|---|---|
| Box, Gaussian, motion blur | Yes | A weighted sum with fixed weights |
| Laplacian, Sobel Gx and Gy | Yes | A weighted sum with fixed weights |
| Sobel magnitude and direction | No | A square root or an angle of Gx and Gy |
| Unsharp mask, threshold 0 | Yes | Equals one kernel |
| Unsharp mask, threshold above 0 | No | The rule depends on the size of the detail |
| Median | No | Sorting is not a weighted sum |
| Gamma | No | A power curve |
| Grayscale, luma methods | Yes | A weighted sum of channels |
| Grayscale, luminance method | No | It decodes to linear light and encodes the sum again |

## What breaks linearity in practice

Even a linear filter is only linear in the mathematics. Three steps in a real image tool are not:

- **Rounding to 8 bits.** Results are rounded to whole numbers.
- **Clipping.** Results below 0 or above 255 are clipped.
- **Encoded values.** A blur on sRGB encoded values is linear in those values, but not in light. The Linear light option filters light instead.

The [Numerical precision](numerical-precision.md) page explains where rounding and clipping happen.
