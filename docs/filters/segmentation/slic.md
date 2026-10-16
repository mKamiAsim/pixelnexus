# SLIC superpixels

--8<-- "filters/slic-facts.md"

## Overview

SLIC splits the image into compact superpixels of about equal size that follow color edges. Achanta and coworkers built it as k-means clustering on color and position, where each pixel only looks at the centers near it. That keeps it fast and makes the superpixels compact. The regions go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make that region the selection, or select all regions at once. The selection can then be saved or exported as a mask, as any selection. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![The input has colored squares of 20 pixels and red disks, with grainy noise. The regions of SLIC with the defaults mostly follow the squares, with some squares merged with a neighbor and the large disk split into three. The boundaries panel draws yellow lines along them over the image. The mean colors panel looks almost like the input, except where squares of different colors share a superpixel.](../../assets/figures/slic-light.svg#only-light){ width="480" }
  ![The input has colored squares of 20 pixels and red disks, with grainy noise. The regions of SLIC with the defaults mostly follow the squares, with some squares merged with a neighbor and the large disk split into three. The boundaries panel draws yellow lines along them over the image. The mean colors panel looks almost like the input, except where squares of different colors share a superpixel.](../../assets/figures/slic-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with colored squares and red disks, with noise of sigma 6. Then the regions of SLIC with the defaults in their label colors, the boundaries in yellow over the image, and each region filled with its mean color.</figcaption>
</figure>

## How it works

--8<-- "filters/slic-steps.md"

## Mathematical foundation

--8<-- "filters/slic-formula.md"

The distance D mixes color and position. Color alone would give scattered regions, and position alone a fixed grid of squares. The compactness m sets the balance. Dividing the position distance by the grid step S makes m work the same at any number of superpixels.

The search window is the key to its speed. Each center only competes for the pixels within 2 S of it, so every pixel is compared with a few centers, not with all of them. The cost is linear in the number of pixels, whatever the number of superpixels.

The clustering alone can leave a superpixel in several pieces. A last pass joins pieces smaller than half the expected size to a neighbor, and the labels are then numbered from 1.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/slic-params.md"

## Implementation

`slic_filter` in `engine/src/pixelnexus_engine/filters/segmentation.py` calls `skimage.segmentation.slic` on the RGB image from 0 to 1. Here scikit-image turns it into CIELAB and enforces connectivity. Its labels start at 1, and `relabel_sequential` numbers them without gaps. The boundaries output draws `skimage.segmentation.mark_boundaries` in yellow, its default. The mean colors output fills each region with the mean of each channel, rounded.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/slic.md"

With 400 superpixels asked and a compactness of 10, the filter makes 262. A compactness of 1 lets color win, so the clusters scatter into many pieces. With 400 asked, the clustering ends with 251 clusters, and the connectivity pass joins their small pieces to neighbors until only 37 remain. A compactness of 100 makes position win, and the superpixels become a near grid of the size asked for. The number asked is a target, and the result depends on the image.

## Complexity

--8<-- "filters/slic-complexity.md"

## Artifacts and limitations

--8<-- "filters/slic-limits.md"

## Tests

The labels must equal scikit-image's slic as a partition, numbered from 1 without gaps. The boundaries must equal mark_boundaries, and the mean colors must fill each region with its rounded mean. The label map must encode in the smallest width that fits, and the table must give each region's area, centroid and mean. The engine API test decodes the label map from the JSON result.

--8<-- "filters/slic-tests.md"

## References

--8<-- "filters/slic-references.md"
