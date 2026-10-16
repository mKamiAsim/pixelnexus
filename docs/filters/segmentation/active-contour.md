# Active contours

--8<-- "filters/active-contour-facts.md"

## Overview

An active contour, or snake, is a closed chain of points. Kass, Witkin and Terzopoulos gave it an energy, like an elastic band that resists bending, and let it slide onto edges. This filter puts the points on the outline of your selection and lets them move. The snake stays one smooth closed curve. Its inside goes to the Features panel and is drawn over the image. Click its row number to make it the selection. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels of a disk and a square on a dark ground with light noise. From a blue box around both objects, the yellow snake wraps the disk and the square in one curve, with a narrow bridge between them. From a blue box around the disk, the yellow snake sits on the edge of the disk. With a rigidity of 10, the yellow snake follows the disk on the left but bulges out toward the square on the right.](../../assets/figures/active-contour-light.svg#only-light){ width="480" }
  ![Four panels of a disk and a square on a dark ground with light noise. From a blue box around both objects, the yellow snake wraps the disk and the square in one curve, with a narrow bridge between them. From a blue box around the disk, the yellow snake sits on the edge of the disk. With a rigidity of 10, the yellow snake follows the disk on the left but bulges out toward the square on the right.](../../assets/figures/active-contour-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 10. Then the snake from a box around both, from a box around the disk, and from the same box with a rigidity of 10. The start is blue and the end yellow.</figcaption>
</figure>

## How it works

--8<-- "filters/active-contour-steps.md"

## Mathematical foundation

--8<-- "filters/active-contour-formula.md"

The internal energy only cares about the shape of the chain. The image energy only cares about where the points are. A step balances the two. Kass, Witkin and Terzopoulos solved for the internal forces with one fixed matrix, so each step is a matrix product and the chain stays stable.

The snake only feels edges close to it. In a flat area, only the elasticity acts, and the snake shrinks. That is why it should start a little outside the object.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/active-contour-params.md"

## Implementation

`active_contour_filter` in `engine/src/pixelnexus_engine/filters/contours.py` takes the largest 8-connected part of the selection and fills its holes. The part is padded by one pixel. Then `skimage.measure.find_contours` at 0.5 gives its outline, half a pixel outside the selected pixels. The outline is resampled to evenly spaced points, our choice. Then `skimage.segmentation.active_contour` moves the points on the blurred luma, with a periodic boundary, so the snake stays closed.

The inside of the final snake comes from `skimage.draw.polygon`, as a label map with one label. The filter stops with a message when the snake shrinks to a line or a point. The selection is only an input. Its catalog entry sets `selectionRole: contour`, so the studio runs the filter on the whole image.

## Worked example

--8<-- "examples/active-contour.md"

With scikit-image's elasticity of 0.01, the snake still sits a few pixels off the disk in places, with a spread of 3.62 pixels. In our first tests, from a box farther away, it barely moved before it counted as settled. So the default is 0.05, which lands within 0.3 pixels of the true radius with a spread under 0.1 pixels. A high rigidity keeps the snake from bending into the corner between the disk and the square, unless a strong elasticity pulls it in.

The figure also shows the main limit. From a box around both objects, the snake cannot split, so it wraps both in one curve.

## Complexity

--8<-- "filters/active-contour-complexity.md"

## Artifacts and limitations

--8<-- "filters/active-contour-limits.md"

## Tests

Evenly spaced points on a square must land on its corners and midpoints. The start must be the outline of the largest part of the selection, with its hole filled, half a pixel outside. The end must be scikit-image's on the blurred luma. From a box around a noisy disk, the snake must settle within 1 pixel of its radius. The contour output must draw the start in blue and the end in yellow. A snake on a flat image must stop with a message. The representation must have its four stages.

--8<-- "filters/active-contour-tests.md"

## References

--8<-- "filters/active-contour-references.md"
