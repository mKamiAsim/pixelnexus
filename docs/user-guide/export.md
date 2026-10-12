# Export

This page explains how to save the current image to a file.

Choose **File > Export** or press Ctrl+S (Cmd+S on a Mac). The file is saved through your browser's downloads.

## Formats

| Format | Quality setting | Transparency | Notes |
|---|---|---|---|
| PNG | No | Kept | Lossless. Every pixel value is written exactly. |
| JPEG | Yes, 1 to 100 | Not supported | Transparent areas become white. |
| WebP | Yes, 1 to 100 | Kept | Lossy at every quality setting. |
| TIFF | No | Kept | Uncompressed, so files are large. |

A lower quality makes a smaller JPEG or WebP file and shows more compression artifacts. The default is 92.

## Size

Turn on **Resize** to export at another size. With **Keep proportions** on, changing the width also changes the height, and the other way round. Resizing uses the browser's high-quality resampling. The image in the studio keeps its size.

## File name

The name starts from the name of the image, without its extension. Letters, digits, dots, hyphens and underscores are kept. Other characters become a hyphen. From Phase 3 on, the name also describes the last filter, for example `photo_gaussian-blur_sigma-2.png`.

## Metadata

Exported files carry no metadata. There is no EXIF data, no GPS position, no camera details and no color profile. PNG files state that their colors are sRGB. If the original file had a color profile, its colors were converted to sRGB when it was opened.

## Check the result

To check what a lossy format did, open the exported file again with **File > Open**. Then compare it with your original image in a second tab, or look at both histograms.
