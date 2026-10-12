# Panels

This page describes each panel of the studio. Open a closed panel from the **Window** menu. See [The workspace](workspace.md) to move and stack panels.

More panels arrive with later phases: Library, Properties, Inspector, Learn and Developer with the first filters, then Masks, Pipeline, Metrics and others.

## Images

The Images panel lists the open images with a thumbnail, the size, the format and the file size. Click an image to show it. The x closes it. A warning sign means the file opened with notes.

**Details** shows the facts about the active image:

| Field | Meaning |
|---|---|
| Format | The format found in the first bytes of the file, not in its name. |
| File size | The size of the file on disk. |
| Stored size | Width and height as stored in the file, before any rotation flag. |
| Color mode | Grayscale, RGB, indexed, CMYK or YCbCr, as stated in the file. |
| Channels in file | For example 1 for gray, 3 for RGB, 4 for RGBA or CMYK. |
| Bit depth in file | Bits per channel in the file. PixelNexus works with 8. |
| Alpha in file | Whether the file has transparency. |
| Color profile | The embedded profile, if any. Colors are converted to sRGB. |
| Working size | The size of the image that PixelNexus works on. |
| Working format | Always 8-bit RGBA, sRGB. |
| Pixels read by | How the browser's pixels were read. "Exact" means no value was changed on the way. |

Notes about the file follow the table. **Edits** lists the changes made since the image was opened.

## Navigator

The Navigator shows the whole image with a red frame around the part you see. Click or drag in it to move the view. The slider and the two buttons change the zoom.

## Info

The Info panel shows the exact values of one pixel: the pixel under the pointer, or the pixel you pinned with the Probe tool (I).

| Value | Meaning |
|---|---|
| RGBA | Red, green, blue and alpha, each from 0 to 255. |
| Hex | The color as a web hex code. |
| Luma | Brightness as Y' = 0.2126 R' + 0.7152 G' + 0.0722 B', on the stored values. |
| HSV | Hue in degrees, saturation and value in percent. |
| Lab | CIE L\*a\*b\* with a D65 white point. |

The **5x5 window** shows the values of the pixel and its neighbors for one channel. The pixel itself is in the center with a blue outline. Each cell is shaded by its value. Cells outside the image stay empty. Filters in later phases use windows like this one, so the panel helps you check them by hand.

## Histogram

The Histogram panel counts how many pixels have each value from 0 to 255.

- **RGB** draws the red, green and blue histograms on top of each other.
- **Luma**, **R**, **G**, **B** and **A** draw one channel.
- **Logarithmic scale** makes rare values visible next to very common ones.

Below the chart are the mean, the standard deviation, the median, the lowest and highest value, and the number of pixels. In RGB view these values are for luma. While you hold the original in view, the histogram shows the original.
