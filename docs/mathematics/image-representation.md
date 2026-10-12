# Image representation

A digital image is a grid of pixels. Each pixel holds a few numbers, one per channel. This page explains how PixelNexus stores those numbers and how filters see them.

## Channels and planes

PixelNexus keeps every image as 8-bit RGBA: red, green, blue and alpha, each a whole number from 0 to 255. The [Image data model](../architecture/image-data-model.md) page describes the memory layout.

A filter rarely works on all four channels at once. The framework first splits the image into **planes**, one grid of numbers per channel. Most filters then work on one plane at a time. The same rule runs on red, green and blue, and the planes are joined again at the end. Alpha is kept as it was.

## Encoded values

The stored values are sRGB encoded. A value of 128 is not half as much light as 255. It is closer to a fifth. The encoding follows IEC 61966-2-1. To turn a stored value \(V'\) into linear light \(V\), with both scaled to the range 0 to 1:

\[
V =
\begin{cases}
V' / 12.92 & \text{if } V' \le 0.04045 \\
\left( \dfrac{V' + 0.055}{1.055} \right)^{2.4} & \text{otherwise}
\end{cases}
\]

where \(V'\) is the stored value divided by 255 and \(V\) is the light intensity from 0 to 1.

Most filters work on the stored values, as most image tools do. Filters that imitate optics, such as the Gaussian blur and motion blur, offer a **Linear light** option. It decodes the values before the filter and encodes them again after it.

## Brightness and color

Some filters should change only the brightness, or only the color. For this, PixelNexus converts the three color planes to BT.709 Y'CbCr:

\[
Y' = 0.2126\,R' + 0.7152\,G' + 0.0722\,B',
\qquad
C_b = \frac{B' - Y'}{1.8556},
\qquad
C_r = \frac{R' - Y'}{1.5748}
\]

where \(R', G', B'\) are the stored values, \(Y'\) is the luma, and \(C_b, C_r\) are the color differences.

- **Brightness only** filters \(Y'\) and keeps \(C_b\) and \(C_r\). Colors keep their hue and strength.
- **Color only** filters \(C_b\) and \(C_r\) and keeps \(Y'\). Detail stays sharp while color noise smooths out.

The conversion back is exact, so a filter that changes nothing gives back the same pixels. Filters that compute a new quantity, such as a gradient, give a gray result when they work on brightness.

## Pixels as samples

A pixel value is a sample of a continuous picture at one point. Filters that compare neighbors, such as derivatives, treat the distance between two neighbors as 1. Kernels are therefore defined at whole-number offsets, as on the [Convolution and correlation](convolution-and-correlation.md) page.
