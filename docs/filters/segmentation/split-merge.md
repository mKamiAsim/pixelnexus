# Split-and-merge segmentation

--8<-- "filters/split-merge-facts.md"

## Overview

Split-and-merge works on a quadtree, after Horowitz and Pavlidis. It cuts the image into quarters, again and again, until every block is uniform. Then it glues neighboring blocks back together while the result stays uniform. A region counts as uniform when its brightest and darkest pixels differ by at most a threshold. The blocks of the split can also be shown. The regions go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make that region the selection, or select all regions at once. The filter runs in the PixelNexus engine, in our own code.

<figure markdown="span">
  ![Four panels. The input has colored squares of 20 pixels and red disks, with grainy noise. The regions follow most squares, but the disks have stair-step outlines and some neighboring squares share a region. The boundaries panel draws yellow stair-step lines. In the mean colors panel, the large disk and some squares are filled with one dull color.](../../assets/figures/split-merge-light.svg#only-light){ width="480" }
  ![Four panels. The input has colored squares of 20 pixels and red disks, with grainy noise. The regions follow most squares, but the disks have stair-step outlines and some neighboring squares share a region. The boundaries panel draws yellow stair-step lines. In the mean colors panel, the large disk and some squares are filled with one dull color.](../../assets/figures/split-merge-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with colored squares and red disks, with noise of sigma 6. Then the regions of split-and-merge with the defaults in their label colors, the boundaries in yellow over the image, and each region filled with its mean color.</figcaption>
</figure>

## How it works

--8<-- "filters/split-merge-steps.md"

## Mathematical foundation

--8<-- "filters/split-merge-formula.md"

The split alone over-segments. A uniform area that the grid of quarters cuts stays in several blocks, since the split never looks across block borders. The merge fixes that by testing neighbors across those borders.

The order of the merge matters, because a merge changes the range of the merged region. This filter tries the neighbors with the closest mean brightness first, and tests each new pair against the regions as they are after earlier merges. Horowitz and Pavlidis leave both the test and the order open. Both choices here are ours.

The range test is strict. One bright pixel fails a whole block, so noise needs a threshold well above its spread.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/split-merge-params.md"

## Implementation

`split_merge` in `engine/src/pixelnexus_engine/filters/split_merge.py` takes the luma in pixel levels. The split keeps a stack of blocks, starting with the whole image. A block that is not uniform splits into four, unless both of its sides are at most the smallest block. A side of odd length splits into a first half of length // 2 and a second half of the rest, so blocks need not be square. A side of 1 cannot split, so such a block splits into two halves only.

A block that stops at the smallest size can still fail the test. It then merges with no neighbor, so it stays a region of its own. The merge keeps the range and the mean of every region in a union-find structure and takes the pairs from a priority queue. Last, the regions are numbered in the raster order of their first pixel.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/split-merge.md"

The noise of sigma 6 spreads each square over about 30 levels of luma. With a threshold of 20, almost no block passes, and the filter makes hundreds of regions. With 30 and blocks down to 1 pixel, it makes 77, close to the 64 squares. With the default smallest block of 4, blocks that straddle an edge stop splitting and stay as regions of their own, which gives 171. A threshold of 60 merges neighboring squares of similar brightness.

## Complexity

--8<-- "filters/split-merge-complexity.md"

## Artifacts and limitations

--8<-- "filters/split-merge-limits.md"

## Tests

A uniform image must be one block. A single bright pixel must split its quarter down to that pixel. Odd sides must split down to single pixels. With a smallest block of 4, a random image must split into 16 blocks of 4 x 4. The merge must join the grid back into two uniform areas, and every merged region must stay within the threshold when blocks go down to one pixel. With the default smallest block, blocks across an edge must stay separate regions.

--8<-- "filters/split-merge-tests.md"

## References

--8<-- "filters/split-merge-references.md"
