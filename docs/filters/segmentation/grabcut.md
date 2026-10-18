# GrabCut

--8<-- "filters/grabcut-facts.md"

## Overview

GrabCut cuts out the object inside a box, after Rother, Kolmogorov and Blake. Everything outside the rectangle around your selection is background. GrabCut learns the colors of the object and the background, cuts the image with a graph cut, and repeats with the colors of the new result. The object goes to the Features panel and is drawn over the image. Click its row number to make it the selection. The filter runs in the PixelNexus engine, with OpenCV. The Object Select tool uses the same code.

<figure markdown="span">
  ![Four panels of a red disk and a green square on a blue ground. The first has a white box around the disk. With noise of sigma 10, a yellow outline sits on the edge of the disk. With noise of sigma 30 and 60, the image is grainy, and the yellow outline still sits on the edge of the disk.](../../assets/figures/grabcut-light.svg#only-light){ width="480" }
  ![Four panels of a red disk and a green square on a blue ground. The first has a white box around the disk. With noise of sigma 10, a yellow outline sits on the edge of the disk. With noise of sigma 30 and 60, the image is grainy, and the yellow outline still sits on the edge of the disk.](../../assets/figures/grabcut-dark.svg#only-dark){ width="480" }
  <figcaption>A red disk and a green square on a blue ground, and a box selected around the disk. Then the object with noise of sigma 10, 30 and 60.</figcaption>
</figure>

## How it works

--8<-- "filters/grabcut-steps.md"

## Mathematical foundation

--8<-- "filters/grabcut-formula.md"

GrabCut extends the graph cuts of Boykov and Jolly in two ways. The region terms come from mixtures of colors instead of histograms of brightness. And no object seeds are needed: the box gives the background, and the rounds of fitting and cutting find the object. Each round can only lower the energy, so the result settles after a few rounds.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/grabcut-params.md"

## Implementation

`grabcut` in `engine/src/pixelnexus_engine/filters/interactive.py` calls `cv2.grabCut` on the 8-bit image in BGR order. With the box start, the box is the rectangle around the selected pixels, those above 127. The filter stops with a message when the selection is empty, or when the box covers the whole image, since then there is no background to learn from. With the map start, the selection levels become OpenCV's four classes: certain object, probable object, probable background and certain background. The object is every pixel that ends as certain or probable object.

The selection is only an input here. Its catalog entry sets `selectionRole: markers`, so the studio runs the filter on the whole image. The object is a label map with one label.

## Worked example

--8<-- "examples/grabcut.md"

On the color image, GrabCut finds the disk almost exactly even with noise of sigma 60, and one round is already enough. The red of the disk and the blue of the ground stay far apart in color.

On the gray image, it finds the disk at noise sigma 10, but returns nothing at sigma 30 and 60. We did not trace where OpenCV loses the object. The lesson is that GrabCut leans on color, and a gray image gives it much less to work with. Graph cuts or the random walker may do better there.

## Complexity

--8<-- "filters/grabcut-complexity.md"

## Artifacts and limitations

--8<-- "filters/grabcut-limits.md"

## Tests

The box must be the rectangle around the selection, and an empty or full selection must stop with a message. The map levels must give OpenCV's four classes. With a box, the result must equal OpenCV's own call, and overlap a red disk by more than 0.95. With a map, pixels marked as certain object must stay object. The representation must have its four stages for both starts.

--8<-- "filters/grabcut-tests.md"

## References

--8<-- "filters/grabcut-references.md"
