# Selections

A **selection** says which pixels a filter may change. PixelNexus stores it as a mask: one number per pixel, from 0 (not selected) to 255 (fully selected). Values between make a soft edge, so a filter fades in. The maths of the blend is on [Masks and alpha blending](../mathematics/masks-and-alpha-blending.md).

## The tools

--8<-- "tools-index.md"

The marquee, lasso, brush and Magic Wand tools are in the tool strip on the left. Color Range, the brightness and hue selections, Subject, Background and Snap to edges are in the **Select** menu. Each tool page lists its settings, which come from the catalog.

## Adding, subtracting and intersecting

A new selection can replace the current one or combine with it. The options bar has four buttons for this, and the keys work as in Photoshop:

| Mode | Key at the start of a drag or click | Result per pixel |
|---|---|---|
| New | none | the new value |
| Add | Shift | the larger of the two values |
| Subtract | Alt | the smaller of the current value and 255 minus the new one |
| Intersect | Shift and Alt | the smaller of the two values |

These are the fuzzy set operators, so soft edges combine smoothly. While you drag a marquee, Shift makes a square or circle and Alt draws from the center.

## Select menu

- **Select all** (Ctrl+A), **Deselect** (Ctrl+D) and **Reselect** (Ctrl+Shift+D), which brings back the selection that Deselect removed.
- **Inverse** (Shift+F7) selects everything that was not selected: each value becomes 255 minus the value.
- **Use the selection** turns the selection off for a while. Filters then work on the whole image, and the selection stays.
- **Modify** has **Grow**, **Shrink**, **Feather** (Shift+F6), **Smooth**, **Border** and **Snap to edges**. Grow, Shrink, Border and Smooth work on the hard selection (values of 128 or more) and give a hard result.
- **Selection from alpha** and **Selection from luminance** make a selection from the transparency or the brightness of the image.
- **Save selection** keeps the selection as a named mask. **Export mask as PNG** saves it as a gray image.
- **Quick Mask** (Q) shows the unselected part with a red tint. **Show mask in gray** shows the mask itself.

Every change to the selection is a step in the History panel, so undo and redo work on selections too.

## Filters and the selection

When the image has a selection, the Properties panel shows **Apply to**: **Selection**, **Outside** or **Whole image**. The preview and Apply both follow it. Pixels where the mask is 0 keep their exact bytes. See [Processing pipeline](../architecture/processing-pipeline.md#selections-and-region-processing).

## Masks panel

The Masks panel shows the selection and the saved masks of the active image. Load a saved mask as the selection, or add, subtract or intersect it. Export and import masks as PNG files. See [Panels](../user-guide/panels.md#masks).

## How the parts fit together

See [Selection and masking](../architecture/selection-and-masking.md) for the code structure, the workers and the tests.
