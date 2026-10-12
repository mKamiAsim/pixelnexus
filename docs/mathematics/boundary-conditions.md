# Boundary conditions

A window near the image edge reaches past it. The filter still needs values there. The **border mode** decides which values it uses. It changes only the pixels near the edge, within the filter's support radius.

## The five modes

The table shows which image column each mode reads for the column numbers \(-2, -1\) on the left and \(5, 6\) on the right of an image 5 pixels wide. Columns 0 to 4 are inside the image.

| Mode | Reads for -2, -1 | Reads for 5, 6 | Same as |
|---|---|---|---|
| Reflect 101 (default) | 2, 1 | 3, 2 | OpenCV `BORDER_REFLECT_101`, SciPy `mirror` |
| Reflect | 1, 0 | 4, 3 | OpenCV `BORDER_REFLECT`, SciPy `reflect` |
| Replicate | 0, 0 | 4, 4 | OpenCV `BORDER_REPLICATE`, SciPy `nearest` |
| Constant (zero) | value 0 | value 0 | OpenCV `BORDER_CONSTANT`, SciPy `constant` with 0 |
| Wrap | 3, 4 | 0, 1 | OpenCV `BORDER_WRAP`, SciPy `grid-wrap` |

- **Reflect 101** mirrors the image without repeating the edge pixel. It keeps edges smooth and is the default in PixelNexus, as in OpenCV.
- **Reflect** mirrors the image and repeats the edge pixel.
- **Replicate** repeats the edge pixel outward.
- **Constant** pretends the outside is black and transparent. Blurs then darken the border.
- **Wrap** continues with the opposite side, as if the image were a tile. It suits periodic patterns and matches the frequency-domain filters.

The rule for one coordinate is in `borderIndex` in `web/src/core/filters/planes.ts`. A test compares it with `numpy.pad` for every mode and for image sizes 1, 2 and 5.

## Regions and halos

The studio often filters only part of an image, such as one tile or the visible part during a preview. To give the same pixels as a run on the whole image, the framework pads the region with a **halo**. The halo is as wide as the filter's support radius. Halo pixels inside the image are real pixels. Halo pixels outside the image come from the border mode.

The filter then runs on the padded region. Its own border rule applies only at the outer edge of the halo, and those pixels are thrown away. The kept pixels only read real or border-mode pixels, exactly as a run on the whole image would. A test checks this for every filter, with regions at the corners and in the middle.
