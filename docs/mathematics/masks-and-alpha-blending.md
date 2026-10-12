# Masks and alpha blending

A filter result does not always replace the whole image. A selection mask can limit it to part of the image, with soft edges. And an image can be partly transparent. This page explains both.

## Blending through a mask

A mask has one byte per pixel. 0 means not selected, 255 means fully selected, and values in between give a soft edge. Every filter result goes through the compositor, whichever engine made it:

\[
I_{\text{out}} = M\, F(I) + (1 - M)\, I,
\qquad
M = \frac{m}{255}
\]

where

- \(I\) is the original pixel and \(F(I)\) the filter result for that pixel.
- \(m\) is the mask byte and \(M\) the same value from 0 to 1.

This is an exact computation, done for every channel including alpha, and rounded once. Two cases are exact without any rounding:

- Where \(m = 0\), the pixel keeps its exact bytes. A test checks this for every filter.
- Where \(m = 255\), the pixel takes the filter result exactly.

The compositor is in `web/src/core/composite/compose.ts`. How the studio picks the mask and the part of the image to process is on [Processing pipeline](../architecture/processing-pipeline.md#selections-and-region-processing).

## Alpha

Alpha says how opaque a pixel is. PixelNexus stores alpha straight: the color values are not multiplied by alpha. Filters keep alpha unchanged.

Averaging filters need care near transparent pixels. A transparent pixel still has color values, but you cannot see them. If a blur averaged them like any other color, they would bleed into the visible pixels as a dark or colored fringe. So averaging filters with positive weights, the box, Gaussian and motion blur, use **alpha weighting** on images with transparency:

\[
C_{\text{out}} = \frac{F(\alpha\, C)}{F(\alpha)}
\]

where

- \(C\) is a color channel and \(\alpha\) the alpha from 0 to 1.
- \(F\) is the blur.

Transparent pixels then add no color. Where \(F(\alpha)\) is 0, the color stays as it was. For a fully opaque image \(\alpha\) is 1 everywhere and the formula reduces to \(F(C)\). So opaque images give the same result as the plain filter. The choice is made once per image, so every tile treats alpha the same way.

Other filters, such as the median and the sharpening filters, work on the straight color values.
