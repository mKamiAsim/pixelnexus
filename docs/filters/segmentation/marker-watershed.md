# Marker-controlled watershed

--8<-- "filters/marker-watershed-facts.md"

## Overview

The marker-controlled watershed lets you choose where regions start. Select a small area inside each object you want, and each separate part of the selection becomes a marker. The image edge outside the selection can be one more marker, for the background. Water then rises from the markers only, over the gradient of the image, and regions meet at the edges between them. The regions go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make that region the selection, or select all regions at once. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. Two touching gray disks on a dark ground, with a small square marker inside each. With the border marker, the regions show the left disk, the right disk and the ground in three colors, split along the edges. The boundaries panel draws yellow lines around both disks and between them. Without the border marker, the left disk keeps its region and the right marker takes both the right disk and the whole ground.](../../assets/figures/marker-watershed-light.svg#only-light){ width="480" }
  ![Four panels. Two touching gray disks on a dark ground, with a small square marker inside each. With the border marker, the regions show the left disk, the right disk and the ground in three colors, split along the edges. The boundaries panel draws yellow lines around both disks and between them. Without the border marker, the left disk keeps its region and the right marker takes both the right disk and the whole ground.](../../assets/figures/marker-watershed-dark.svg#only-dark){ width="480" }
  <figcaption>Two touching disks with noise of sigma 6, and a square marker selected inside each. Then the regions with the border marker, the boundaries in yellow, and the regions without the border marker.</figcaption>
</figure>

## How it works

--8<-- "filters/marker-watershed-steps.md"

## Mathematical foundation

--8<-- "filters/marker-watershed-formula.md"

The plain watershed starts a region in every deep enough valley, so it needs a depth to stop noise. Markers replace that guess. Meyer and Beucher made markers the standard way to tell the watershed which objects to find: one marker per object, and one for the background.

The flood from a marker covers everything it can reach before it meets another flood. So every pixel ends up in some region. Without a background marker, the ground has no marker of its own and goes to whichever object floods it first.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/marker-watershed-params.md"

## Implementation

`marker_watershed` in `engine/src/pixelnexus_engine/filters/segmentation.py` uses the same elevation as the watershed, the Sobel gradient of the blurred luma. The selection arrives as a mask, and each 8-connected part of its selected pixels, those above 127, is one marker. With the border marker on, the pixels on the image edge that are not selected form one more marker. Then `skimage.segmentation.watershed` floods from the markers. The filter stops with a message when the selection is empty, or when there is only one marker.

The selection is only an input here. Its catalog entry sets `selectionRole: markers`, so the studio runs the filter on the whole image.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/marker-watershed.md"

With the border marker, each disk gets a region of about its own size. The overlap with the true disk is 0.85 for the left disk and 0.80 for the right one. The blur and the noise move the boundary a little, and the right region spills a little past its disk. Without the border marker, the ground has no marker, so the right disk's flood takes it, and its region becomes ten times too large.

## Complexity

--8<-- "filters/marker-watershed-complexity.md"

## Artifacts and limitations

--8<-- "filters/marker-watershed-limits.md"

## Tests

On two squares with a marker in each, each square must become one region and the edge the third. The markers must be one per part of the selection plus one for the edge. An empty selection, or a single marker without the border marker, must stop with a message. The representation must have its three stages.

--8<-- "filters/marker-watershed-tests.md"

## References

--8<-- "filters/marker-watershed-references.md"
