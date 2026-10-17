# Masks and refinement

A selection is a mask: one value per pixel from 0 to 255. This page covers changing a selection after you made it, keeping it, and moving it between images and files. The code is in `web/src/core/mask/refine.ts`.

## Refine: Select > Modify

Grow, Shrink, Border and Smooth work on the hard selection, where a pixel counts as selected when its value is at least 128. Their results are hard. Distances are Euclidean, between pixel centers, from the exact distance transform.

| Command | What it does |
|---|---|
| **Grow** | Adds every pixel within the radius of the selection. |
| **Shrink** | Removes every pixel within the radius of the unselected area. Optionally the image edge counts as unselected too. |
| **Border** | A band along the edge, the given width in total. Half lies inside the selection and half outside. |
| **Smooth** | A majority vote in a square window of side \(2r + 1\). It removes small specks and rounds corners. On a tie a pixel keeps its state. |
| **Feather** | A Gaussian blur of the mask with standard deviation \(r / 2\). About 95 percent of the change from selected to unselected happens within \(r\) pixels on each side of the old edge. |
| **Snap to edges** | Moves a rough selection onto nearby image edges. See [Snap to edges](snap-to-edges.md). |

Feather works on any mask and gives a soft one. At the image edge the edge pixels repeat, so a selection that touches the edge does not fade there.

## Keep a selection: the Masks panel

**Select > Save selection** keeps the current selection under a name. The **Masks** panel lists the saved ones. Loading one can replace the selection or combine with it: add, subtract or intersect, with the same rules as the selection tools. Saved selections are not part of the history, but a [project file](../user-guide/projects.md) keeps them.

## Masks as files

- **Select > Export mask as PNG**, or the export button in the Masks panel, saves the selection as a gray PNG named after the image, such as `photo_mask.png`. White is selected and black is not.
- The import button in the Masks panel reads an image file as a selection: its brightness becomes the selection. It must have the size of the image.
- **Selection from alpha** and **Selection from luminance** make a selection from the image's own transparency or brightness.

## How a soft mask blends

A filter result \(F\) and the image \(I\) are blended with \(M = \text{mask} / 255\): \(I_{\text{out}} = M F + (1 - M) I\). Pixels with 0 keep their exact bytes. See [Masks and alpha blending](../mathematics/masks-and-alpha-blending.md).
