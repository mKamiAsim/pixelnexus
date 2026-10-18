# Crop

--8<-- "filters/crop-facts.md"

## Overview

Crop keeps a rectangle of the image and drops the rest. Open it from **Image > Crop**. When there is a selection, the rectangle starts at its bounds, so a marquee followed by Crop cuts the image to it. Without a selection, the rectangle starts at the whole image, and you type the edges. Pixel values never change, and the selection is cropped with the image.

## How it works

1. Choose the rectangle, or let the selection choose it.
2. Copy every pixel inside it to the new image, as it is.

## Mathematical foundation

--8<-- "filters/crop-formula.md"

A crop moves the origin of the coordinates to the corner of the rectangle and keeps only the pixels inside it. Since no value changes, cropping and then applying a point filter gives the same result as the other way round. Filters with a window are different near the new edges, where they now see the border mode instead of the old neighbors.

## Kernel or operator

There is no kernel. Each output pixel is one input pixel.

## Algorithm

--8<-- "filters/crop-steps.md"

## Parameters

--8<-- "filters/crop-params.md"

## Implementation

The code is in `web/src/core/image/transform.ts`. There, `crop` copies each row of the rectangle as 32-bit words, one per pixel, and `clampCrop` first cuts the rectangle to the image. `cropActive` in `web/src/app/geometryActions.ts` crops the image and the selection. It also records the step in the history. The dialog shows the size of the result before you apply it.

## Worked example

Take an image of 3 x 2 pixels whose red values number the pixels. Crop the rectangle at x 1, y 0, with width 2 and height 2:

\[
\begin{pmatrix} 0 & 1 & 2 \\ 3 & 4 & 5 \end{pmatrix}
\;\to\;
\begin{pmatrix} 1 & 2 \\ 4 & 5 \end{pmatrix}
\]

A rectangle at x -2, y 1 with width 4 and height 9 reaches past the image. It is cut to x 0, y 1, width 2 and height 1 first. A rectangle that starts at x 3 lies wholly outside and is refused.

## Complexity

--8<-- "filters/crop-complexity.md"

## Artifacts and limitations

--8<-- "filters/crop-limits.md"

## Tests

The unit tests check the example above, that all four channels are copied unchanged, and that rectangles are cut to the image or refused.

--8<-- "filters/crop-tests.md"

## References

--8<-- "filters/crop-references.md"
