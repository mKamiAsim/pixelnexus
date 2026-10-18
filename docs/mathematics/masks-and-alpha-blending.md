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

## Combining masks

A new selection combines with the current one, pixel by pixel. With \(a\) the current mask byte and \(b\) the new one:

| Mode | Result |
|---|---|
| New | \(b\) |
| Add | \(\max(a, b)\) |
| Subtract | \(\min(a,\ 255 - b)\) |
| Intersect | \(\min(a, b)\) |
| Inverse | \(255 - a\) |

These are the standard fuzzy set operators for union, difference, intersection and complement. They are exact on bytes, need no rounding, and agree with plain set operations when the masks are only 0 and 255. A soft edge stays soft after any of them.

## Distances: grow, shrink and border

Grow, shrink and border work on the **hard** selection: a pixel counts as selected when \(m \ge 128\). The distance between two pixels is the Euclidean distance between their centers. The exact distance transform gives every pixel its distance to the nearest pixel of a set. It takes time in proportion to the number of pixels (Felzenszwalb and Huttenlocher, Theory of Computing 8(19), 2012, DOI [10.4086/toc.2012.v008a019](https://doi.org/10.4086/toc.2012.v008a019)). The code is in `web/src/core/mask/distance.ts`.

With \(d_{\text{in}}(p)\) the distance from \(p\) to the nearest selected pixel and \(d_{\text{out}}(p)\) the distance to the nearest unselected pixel:

- **Grow by \(r\)** selects \(p\) when \(d_{\text{in}}(p) \le r\).
- **Shrink by \(r\)** keeps \(p\) when \(d_{\text{out}}(p) > r\). With the image-edge option, the area outside the image counts as unselected.
- **Border of width \(w\)** selects the selected pixels with \(d_{\text{out}} \le \lceil w/2 \rceil\) and the unselected pixels with \(d_{\text{in}} \le \lfloor w/2 \rfloor\).

These are exact computations. The results are hard masks.

## Feather

Feather blurs the mask with a Gaussian of standard deviation

\[
\sigma = \frac{r}{2}
\]

where \(r\) is the feather radius in pixels. For a straight edge, the blurred value follows the normal distribution function across the edge. About 95% of the change from selected to unselected then lies within \(2\sigma = r\) pixels on each side. Outside the image the edge pixels repeat, so a selection that touches the image edge does not fade there. A test checks that a feathered selection blends a filter within 1/255 of the formula above.

## Smooth

Smooth with radius \(r\) is a majority vote in a square window of side \(2r + 1\). A pixel becomes selected when more than half of the window pixels inside the image are selected, unselected when fewer than half are, and keeps its state on a tie. A summed-area table counts the window in constant time per pixel. Small specks go away and corners round.

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
