# Panels

This page describes each panel of the studio. Open a closed panel from the **Window** menu. See [The workspace](workspace.md) to move and stack panels.

More panels arrive with later phases, such as Pipeline.

## Library

The Library lists every filter in the catalog, grouped by family. Each row has a status badge: **Tested** filters can run, **Planned** filters cannot run yet.

- **Search.** Type part of a name, an alias, a method or a purpose, for example "blur", "edge" or "salt". Every word must match. Names count most.
- **Show.** **All**, **Ready** (filters that can run) or **Planned**.
- **Refine.** Narrow the list by family, linearity, domain, purpose, noise type and engine. **Clear refinements** removes them.
- **Favorites.** The star next to a filter adds it to **Favorites** at the top of the list. Favorites are saved in this browser.

Click a filter to select it. The Properties, Inspector, Learn and Developer panels then show that filter. The **Filter** menu and the command palette (Ctrl+K) list the same filters by family.

## Properties

The Properties panel shows the settings of the selected filter and runs it.

- **Header.** The name, the status, a one-line summary, and badges for linearity, domain and engine.
- **Parameters.** One control per parameter, built from the catalog. Drag a slider or type a number. Size parameters accept only allowed values, for example odd sizes. Angles have a dial. **More settings** holds the advanced ones, such as the border mode and the channel scope.
- **Apply to.** When the image has a selection, choose **Selection**, **Outside** (everything except the selection) or **Whole image**. Soft selection edges blend the result with the image. Without a selection, filters work on the whole image.
- **Preview.** Shows the result on the canvas while you change values. With a selection, the preview shows only where the filter will work. A line below it says whether the preview is exact or approximate. See [Execution model](../architecture/execution-model.md).
- **Apply** runs the filter at full resolution (Ctrl+Enter or Cmd+Enter), on the part that **Apply to** names. While it runs, a progress bar and **Cancel** appear.
- **Reset** returns the parameters to their defaults.
- **Presets.** Save the current values under a name, load them later or delete them. Presets are saved in this browser.
- **Copy JSON** copies the filter id and the values.
- **Last run** shows how long the last preview or Apply took.

A planned filter shows its settings where they are known, says which phase brings it, and keeps **Apply** disabled.

## Inspector

The Inspector shows the mathematics of the selected filter: formula, operator, parameters, algorithm, limits and references. All of it uses your current values. A filter that uses a learned model also has a **Model** tab. It shows the model card from the catalog: format, size, license and paper. With the local engine running and the model downloaded, it also lists the real input and output tensors, read from the model files. See [The Inspector](../mathematical-inspector/overview.md).

## Learn

The Learn panel explains the selected filter in plain words and runs small demos on your image. See [The Learn panel](learn-panel.md).

## Developer

The Developer panel shows the code, the data types, the timing and the full catalog entry of the selected filter. See [Developer mode](../mathematical-inspector/developer-mode.md).

## History

The History panel lists the steps of the active image. Step 0 is the original.

- Click a step to go back or forward to it. Steps after the current one are grayed out and crossed through. They come back with **Redo**.
- **Undo** (Ctrl+Z), **Redo** (Ctrl+Shift+Z) and **Revert to original** sit at the top. Revert adds a step, so you can undo it.
- Each step shows a thumbnail and its time. A filter step names the filter and its main values, for example "Gaussian filter (sigma 2 px)". AI results are marked **AI**.
- The details button of a step shows all its values, its scope (whole image, inside or outside the selection), its size and the full date and time.
- The delete button removes a step. The steps after it are computed again from the step before, with their own values and scope. A step that cannot be computed again, such as a rotation, an AI result or a pipeline run, blocks the delete, and the message names it. If a later step fails, nothing is deleted.
- The memory line shows how much memory the history holds and how many steps it has. **Free memory** keeps only the original and the current step.
- An image keeps at most 50 steps and at most 768 MB of pixels by default. Change both in **Edit > Preferences**, under History. When it needs room, the oldest steps go first, and the panel says how many were dropped. The original always stays.


## Pipeline

The Pipeline panel holds a chain of filter steps to run on the original image, and to save or load as JSON. See [Pipelines](pipelines.md).
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

Notes about the file follow the table. The History panel lists the changes made since the image was opened.

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

## Features

Feature detectors, such as LoG blob detection, and segmentation filters, such as SLIC superpixels, find things in the image instead of changing it. The Features panel lists what the last of them found on the active image.

- **The table.** One row per feature, with the strongest first. The x and y columns give the position of each feature in pixels, with the center of the top-left pixel at 0, 0. Some detectors give positions between pixels. Other columns depend on the detector, such as the radius, sigma and the score. The table shows the first 200 rows.
- **Show on the canvas** draws each feature over the image: a circle of its radius, or a small cross when it has none. The canvas draws at most 2000 features.
- **Export CSV** saves all rows as a CSV file, with the units in the header.
- **Regions** from a segmentation are drawn over the image in their label colors, see through, with solid boundaries. Their table gives each region's label, area, centroid and mean brightness. Click a row number to make that region the selection, or click **Select all regions**. From there, the selection works like any other, so you can save it or export it as a mask.
- **Clear** forgets the features of this image.

Features belong to the image they were found on. After the image changes, they stay in the panel but leave the canvas. With a selection, a detector still looks at the whole image, and only the features whose center lies in the selection are kept. Regions always cover the whole image. Features never become a History step, since the pixels do not change.

## Masks

The Masks panel shows the selection of the active image and its saved masks. White is selected and black is not.

- **Selection.** A small picture of the selection and one line about its size and position.
- **Save selection** keeps the selection as a named mask (Select > Save selection). Saved masks stay with the image until you close it.
- **Export PNG** saves the selection as a gray PNG file. **Import** reads an image file of the same size as a selection: bright pixels are selected.
- **Saved masks.** The buttons next to a saved mask load it as the selection, add it, subtract it or intersect with it. The last button deletes it.
