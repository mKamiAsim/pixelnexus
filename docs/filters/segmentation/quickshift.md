# Quickshift

--8<-- "filters/quickshift-facts.md"

## Overview

Quickshift groups pixels around the peaks of their density in color and position, after Vedaldi and Soatto. Each pixel links to its nearest neighbor that is more typical, with a higher density. The links climb toward the peaks, and long links are cut. Each tree of links that remains is a region, so the number of regions follows the image. The regions go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make that region the selection, or select all regions at once. The selection can then be saved or exported as a mask, as any selection. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![The input has colored squares of 20 pixels and red disks, with grainy noise. The regions of Quickshift with the defaults follow the squares and the disks closely, with a few tiny specks. The boundaries panel draws yellow lines along the squares and around the disks. The mean colors panel looks like a clean copy of the input.](../../assets/figures/quickshift-light.svg#only-light){ width="480" }
  ![The input has colored squares of 20 pixels and red disks, with grainy noise. The regions of Quickshift with the defaults follow the squares and the disks closely, with a few tiny specks. The boundaries panel draws yellow lines along the squares and around the disks. The mean colors panel looks like a clean copy of the input.](../../assets/figures/quickshift-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with colored squares and red disks, with noise of sigma 6. Then the regions of Quickshift with the defaults in their label colors, the boundaries in yellow over the image, and each region filled with its mean color.</figcaption>
</figure>

## How it works

--8<-- "filters/quickshift-steps.md"

## Mathematical foundation

--8<-- "filters/quickshift-formula.md"

Quickshift is a mode-seeking method, like mean shift. Mean shift moves every point step by step uphill on the density until it stops at a peak. Quickshift instead moves each point once, straight to its nearest neighbor of higher density. That builds a tree whose roots are the peaks, without iterating.

The density joins color and position. The color weight sets how much color counts against position. With 1, colors that differ split regions even when they touch. With small values, regions become compact blobs whatever their color.

Cutting links longer than the longest link separates the trees. Without the cut, every pixel would link up to the single highest peak of the image.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/quickshift-params.md"

## Implementation

`quickshift_filter` in `engine/src/pixelnexus_engine/filters/segmentation.py` calls `skimage.segmentation.quickshift` on the RGB image from 0 to 1, which scikit-image turns into CIELAB. It uses scikit-image's fixed seed 42, which breaks ties between equal densities, so a run always gives the same regions. Here scikit-image searches a window that reaches 3 times the kernel size, rounded up, on each side. Its labels start at 0, so the filter adds 1. The boundaries output draws `skimage.segmentation.mark_boundaries` in yellow, and the mean colors output fills each region with its rounded mean.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/quickshift.md"

A longest link of 5 is shorter than the noise, so the image falls into about 500 tiny regions. A longest link of 10, the default, gives 72 regions, close to the 64 squares, and 20 gives about the same. The kernel size changes little on this image, since its regions are large and flat.

## Complexity

--8<-- "filters/quickshift-complexity.md"

## Artifacts and limitations

--8<-- "filters/quickshift-limits.md"

## Tests

The labels must equal scikit-image's quickshift with seed 42 plus 1. On four flat colored quarters with a little noise, a kernel size of 3 and a longest link of 30, it must find exactly the four quarters. The boundaries and mean colors outputs must match mark_boundaries and the rounded means. The representation must have its three stages.

--8<-- "filters/quickshift-tests.md"

## References

--8<-- "filters/quickshift-references.md"
