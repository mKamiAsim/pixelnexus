# Resize

--8<-- "filters/resize-facts.md"

## Overview

Resize changes the size of the image in pixels. Open it with **Image > Resize** (Ctrl+Alt+I or Cmd+Alt+I). Four methods decide how the new pixels are mixed from the old ones: nearest neighbor, bilinear, bicubic and Lanczos. When the image shrinks, the method averages the pixels each new pixel covers, so fine patterns do not turn into false coarse ones.

<figure markdown="span">
  ![A plot of the three resampling kernels from -3 to 3 source pixels. Bilinear is a triangle from -1 to 1. Bicubic and Lanczos are higher near 0 and dip below 0 between 1 and 2.](../../assets/figures/resize-light.svg#only-light){ width="480" }
  ![A plot of the three resampling kernels from -3 to 3 source pixels. Bilinear is a triangle from -1 to 1. Bicubic and Lanczos are higher near 0 and dip below 0 between 1 and 2.](../../assets/figures/resize-dark.svg#only-dark){ width="480" }
  <figcaption>The three kernels. Bicubic and Lanczos dip below 0, which keeps edges sharper.</figcaption>
</figure>

## How it works

1. Find where the center of each new pixel falls in the old image.
2. Mix the old pixels near that spot, with weights from the chosen kernel that add up to 1.
3. When shrinking, widen the kernel by the shrink factor, so it averages all the covered pixels.
4. Do this along the rows, then along the columns.

Nearest neighbor skips the mixing and copies the old pixel under the new center.

## Mathematical foundation

--8<-- "filters/resize-formula.md"

The kernels are mathematical definitions, the same as in Pillow:

\[
k_{\text{bilinear}}(x) = \max(0,\ 1 - |x|),
\qquad
k_{\text{Lanczos}}(x) =
\begin{cases}
\operatorname{sinc}(x)\, \operatorname{sinc}(x/3) & |x| < 3 \\
0 & \text{otherwise}
\end{cases}
\]

\[
k_{\text{bicubic}}(x) =
\begin{cases}
(a + 2)|x|^3 - (a + 3)|x|^2 + 1 & |x| \le 1 \\
a|x|^3 - 5a|x|^2 + 8a|x| - 4a & 1 < |x| < 2 \\
0 & \text{otherwise}
\end{cases}
\qquad a = -\tfrac{1}{2}
\]

where \(x\) is the distance in source pixels, after the stretch by \(f\), and \(\operatorname{sinc}(t) = \sin(\pi t) / (\pi t)\). The bicubic kernel is the cubic convolution of Keys (1981) with \(a = -1/2\).

Shrinking without the stretch \(f\) would sample the image too sparsely. Patterns finer than the new pixel spacing would fold back as false coarse patterns, called aliasing. Stretching the kernel by the shrink factor makes it a low-pass filter for the new spacing, so those patterns are averaged away first.

## Kernel or operator

Kernel values at a few distances, from the code.

--8<-- "kernels/resize.md"

## Algorithm

--8<-- "filters/resize-steps.md"

## Parameters

--8<-- "filters/resize-params.md"

## Implementation

`resizeImageTo` in `web/src/core/image/resample.ts` precomputes, for each output column and each output row, the first source pixel and the normalized weights. Then it runs the two passes in floating point, with colors premultiplied by alpha, and rounds once at the end. Near the image edge, source pixels outside the image are left out, and the remaining weights are divided by their sum. The selection is resized with the image, with bilinear weights.

Resize changes the image size, so it does not run through the tiled filter engine, and it has no live preview. Its catalog entry names the command `image.resize`, which the Library, the Properties panel and Ctrl+Enter open.

## Worked example

--8<-- "examples/resize.md"

## Complexity

--8<-- "filters/resize-complexity.md"

## Artifacts and limitations

--8<-- "filters/resize-limits.md"

## Tests

The reference is a NumPy version of the same definitions in `tools/fixtures_geometry.py`. Before writing it, the fixture script checks it against Pillow's resize on an opaque image. Pillow rounds to 8 bits between its two passes, so the check uses a twin of the reference that does the same, and allows 1 level. Nearest neighbor must match Pillow exactly. The test compares all four methods for four sizes on an image with transparent pixels, within 1 level.

--8<-- "filters/resize-tests.md"

## References

--8<-- "filters/resize-references.md"
