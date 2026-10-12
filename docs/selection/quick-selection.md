# Quick Selection

--8<-- "tools/quick-selection-facts.md"

## Overview

Quick Selection (**Shift+W**) selects a whole object from a few brush strokes inside it. The selection grows from where you paint to areas of similar color and texture, and stops at clear edges.

## How to use it

1. Choose Quick Selection. The options bar says while the image is being prepared, which takes about a second or less.
2. Paint inside the object. The selection grows while you paint.
3. Paint again to add more. Hold **Alt** and paint to remove a part that leaked out.
4. Raise the tolerance to grow further, or the edge sensitivity to stop sooner at edges.

## How it works

--8<-- "tools/quick-selection-steps.md"

## Mathematical foundation

**Superpixels.** SLIC (Achanta et al., 2012) splits the image into small patches of similar color, called superpixels. It is k-means clustering on five numbers per pixel: the CIELAB color and the position. Each center only looks at pixels within a \(2S \times 2S\) window around it, where \(S\) is the grid step. The distance is

\[
D = \sqrt{d_c^2 + \left(\frac{d_s}{S}\right)^2 m^2}
\]

where

- \(d_c\) is the CIELAB distance between the pixel and the center,
- \(d_s\) is the distance in pixels between them,
- \(S\) is the grid step, chosen for about 3000 superpixels and kept from 6 to 32 pixels,
- \(m = 10\) is the compactness.

This is the definition from the paper. Centers start on a grid and move to the lowest color gradient in their 3x3 neighborhood. After 10 iterations, every piece that is not connected to the rest of its superpixel gets its own label, and pieces smaller than \(S^2/4\) pixels join a neighbor.

**Facts per superpixel.** Each superpixel \(i\) records its mean color \(c_i\) (CIELAB, scaled so L* runs from 0 to 255) and its texture \(\tau_i\), the standard deviation of L* inside it. For two neighbors \(i\) and \(j\), the edge strength is

\[
e_{ij} = \operatorname{clamp}\!\left(\frac{\bar g_{ij} - \tfrac{1}{2}(\bar g_i + \bar g_j)}{g_{\max}}\right)
\]

where \(\bar g_{ij}\) is the mean Sobel gradient of L* on their shared border, \(\bar g_i\) and \(\bar g_j\) are the mean gradients inside them, and \(g_{\max}\) is the largest gradient in the image. So an edge counts only when it is stronger than the texture inside the two superpixels.

**Growth.** This rule is PixelNexus's own. A neighbor \(j\) of a selected superpixel \(i\) joins when

\[
\min_{k \in \text{seeds}} \big( \lVert c_j - c_k \rVert + |\tau_j - \tau_k| \big) + 255\, \sigma\, e_{ij} \le T
\]

where \(\sigma\) is the edge sensitivity from 0 to 1 and \(T\) the tolerance. Comparing with the seeds, not with the neighbor, keeps a slow change of color from leading the selection away.

## Parameters

--8<-- "tools/quick-selection-params.md"

## Implementation

The superpixels are made once per image, in a Web Worker, so the studio stays responsive. Large images use a copy of at most 2 megapixels. The selection is smoothed at that size, then scaled up with bilinear interpolation, which softens the edge by about one pixel of the copy. On a 512 x 512 image the preparation took about 0.25 seconds on the development PC.

## Limitations

- On images larger than 2 megapixels the edge follows the smaller copy. Use **Select > Modify > Snap to edges** afterward for an exact edge.
- Textured objects on a textured background are hard to separate.

## Tests

--8<-- "tools/quick-selection-tests.md"

## References

--8<-- "tools/quick-selection-references.md"
