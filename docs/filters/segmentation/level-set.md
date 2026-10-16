# Level sets

--8<-- "filters/level-set-facts.md"

## Overview

This filter fits a loose selection to the edges of the image. It is the morphological geodesic active contour of Marquez-Neila, Baumela and Alvarez. A balloon force shrinks or grows the outline of the selection, one pixel at a time, and edges stop it. The outline can split and merge, so one box around several objects can end on each of them. The inside goes to the Features panel and is drawn over the image. Click its row number to make it the selection. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. A disk and a square on a dark ground with light noise, and a white box around both. The edge stopping image is white with a mottled texture, and dark rings along the edges of the disk and the square. Shrunk from the box, yellow outlines sit on the disk and the square, with a few tiny yellow specks left in the ground. Grown from small spots, the disk is outlined well, while the outline of the square has a dent on its left side.](../../assets/figures/level-set-light.svg#only-light){ width="480" }
  ![Four panels. A disk and a square on a dark ground with light noise, and a white box around both. The edge stopping image is white with a mottled texture, and dark rings along the edges of the disk and the square. Shrunk from the box, yellow outlines sit on the disk and the square, with a few tiny yellow specks left in the ground. Grown from small spots, the disk is outlined well, while the outline of the square has a dent on its left side.](../../assets/figures/level-set-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 10, and a box selected around both. Then the edge stopping image, the contour shrunk from the box, and the contour grown from a small square inside each object.</figcaption>
</figure>

## How it works

--8<-- "filters/level-set-steps.md"

## Mathematical foundation

--8<-- "filters/level-set-formula.md"

The geodesic active contour of Caselles, Kimmel and Sapiro moves a curve so that it becomes the shortest path in a space where edges are cheap. Written as a level set, it is a partial differential equation, which needs a careful step size.

Marquez-Neila, Baumela and Alvarez showed that each term has a morphological twin. The balloon term is a dilation or an erosion. The curvature term is a pair of operators, SI and IS, that remove small bumps and dents. So each step only switches pixels between inside and outside, and there is no step size to choose.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/level-set-params.md"

## Implementation

`level_set` in `engine/src/pixelnexus_engine/filters/contours.py` makes the edge stopping image with `skimage.segmentation.inverse_gaussian_gradient` on the luma from 0 to 1. Then `skimage.segmentation.morphological_geodesic_active_contour` starts from the selected pixels, those above 127. The threshold is scikit-image's automatic one, the 40th percentile of g. The filter stops with a message when the selection is empty.

The selection is only an input here. Its catalog entry sets `selectionRole: contour`, so the studio runs the filter on the whole image. The inside is a label map with one label. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/level-set.md"

From the box, the contour reaches the objects after about 100 steps. With the default smoothing, noise in the ground leaves 16 small specks. There, g is low enough that the balloon cannot erode them. A smoothing of 2 removes them and gives an overlap of 0.990.

Grown from small spots, the contour stops early on the left side of the square, where the noise stopped it. The figure shows the dent. More steps do not help, since the contour no longer moves.

## Complexity

--8<-- "filters/level-set-complexity.md"

## Artifacts and limitations

--8<-- "filters/level-set-limits.md"

## Tests

The result must be scikit-image's from the selection. On a noisy disk, the contour must shrink from a box and grow from a small disk to an overlap above 0.98. The edge stopping output must be g times 255. An empty selection must stop with a message. The representation must have its four stages.

--8<-- "filters/level-set-tests.md"

## References

--8<-- "filters/level-set-references.md"
