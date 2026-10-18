# Felzenszwalb-Huttenlocher segmentation

--8<-- "filters/felzenszwalb-facts.md"

## Overview

Felzenszwalb and Huttenlocher's method merges neighboring pixels into regions along a graph. It goes through the links between neighbors from the most similar pair. Two regions merge when the link between them is no larger than the variation inside them, plus a margin that shrinks as the regions grow. Busy areas stay split into small regions, and smooth areas grow large. The regions go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make that region the selection, or select all regions at once. The selection can then be saved or exported as a mask, as any selection. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![The input has colored squares of 20 pixels and red disks, with grainy noise. With the defaults, the regions break each square into many small pieces with ragged edges. The boundaries panel is covered with yellow lines. The mean colors panel looks almost like the input.](../../assets/figures/felzenszwalb-light.svg#only-light){ width="480" }
  ![The input has colored squares of 20 pixels and red disks, with grainy noise. With the defaults, the regions break each square into many small pieces with ragged edges. The boundaries panel is covered with yellow lines. The mean colors panel looks almost like the input.](../../assets/figures/felzenszwalb-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with colored squares and red disks, with noise of sigma 6. Then the regions with scikit-image's defaults in their label colors, the boundaries in yellow over the image, and each region filled with its mean color.</figcaption>
</figure>

## How it works

--8<-- "filters/felzenszwalb-steps.md"

## Mathematical foundation

--8<-- "filters/felzenszwalb-formula.md"

The test compares the weight of the linking edge with the internal difference Int of each region, the largest step inside it. A region whose pixels vary a lot accepts a large step to a neighbor, and a uniform region does not. That lets the method keep textured regions together and still separate flat regions with a small step between them.

The term k / |C| matters most for small regions. A single pixel has no internal difference, so without the term nothing would ever merge. The term lets small regions merge across larger steps, and its effect fades as regions grow. So the scale k sets the size of the regions only loosely.

Taking the edges from the lightest builds the minimum spanning tree of each region on the way, which is why Int is the heaviest edge of that tree.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/felzenszwalb-params.md"

## Implementation

`felzenszwalb_filter` in `engine/src/pixelnexus_engine/filters/segmentation.py` calls `skimage.segmentation.felzenszwalb` on the RGB image from 0 to 1. Here scikit-image blurs each channel, links each pixel to its 8 neighbors by the Euclidean color distance, and divides the scale by 255 so it works as on pixel levels. Its labels start at 0, so the filter adds 1. The boundaries output draws `skimage.segmentation.mark_boundaries` in yellow, and the mean colors output fills each region with its rounded mean.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/felzenszwalb.md"

With scikit-image's defaults, a scale of 1 and a smallest region of 20, the noise breaks the 64 squares into 355 regions. Raising the smallest region to 100 joins the specks and gives 64 regions, close to the squares. A larger scale also merges more, but on this image it never reaches the clean result of the larger smallest region alone. The scale and the smallest region work together, and good values depend on the image and its noise.

## Complexity

--8<-- "filters/felzenszwalb-complexity.md"

## Artifacts and limitations

--8<-- "filters/felzenszwalb-limits.md"

## Tests

The labels must equal scikit-image's felzenszwalb plus 1. On four flat colored quarters with a little noise and a smallest region of 200, it must find exactly the four quarters. The boundaries and mean colors outputs must match mark_boundaries and the rounded means. The representation must have its three stages.

--8<-- "filters/felzenszwalb-tests.md"

## References

--8<-- "filters/felzenszwalb-references.md"
