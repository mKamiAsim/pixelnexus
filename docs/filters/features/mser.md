# MSER region detector

--8<-- "filters/mser-facts.md"

## Overview

MSER finds maximally stable extremal regions. These are blobs of any shape that are brighter or darker than everything around them, and whose area hardly changes as a threshold moves through the gray levels. Text characters, signs and spots are typical examples. Each region is listed with its centroid, the radius of a disk of the same area, its long axis and its area. The regions go to the Features panel and are drawn on the canvas. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Three panels. The Disks image as it is has no regions marked. After a blur, rings with a line along the long axis mark the three smaller disks at the top right and the large disk at the bottom left. The blurred Siemens star has no regions marked.](../../assets/figures/mser-light.svg#only-light){ width="480" }
  ![Three panels. The Disks image as it is has no regions marked. After a blur, rings with a line along the long axis mark the three smaller disks at the top right and the large disk at the bottom left. The blurred Siemens star has no regions marked.](../../assets/figures/mser-dark.svg#only-dark){ width="480" }
  <figcaption>The regions MSER finds with the defaults on the Disks image as it is. Then the same on the Disks image and a Siemens star with 12 spokes after a blur of sigma 3. Each region is a ring of the same area with a line along its long axis.</figcaption>
</figure>

## How it works

--8<-- "filters/mser-steps.md"

## Mathematical foundation

--8<-- "filters/mser-formula.md"

Threshold the image at a gray level t. The pixels at or below t form connected regions. As t rises, new regions appear, grow and merge, until one region covers the image. Each of these regions is extremal: every pixel inside it is darker than every pixel on its border. All of them together form a tree, the component tree of the image.

Matas and coworkers keep the regions whose area changes least as t moves by delta. A region with a local minimum of the variation v is maximally stable. Such regions have clear borders, so they come back in other views of the same scene. Sweeping t the other way gives the bright regions, and OpenCV finds both in one run. Changing the brightness in a way that keeps the order of the gray levels does not change the tree.

OpenCV adds limits on the area and the variation, and prunes nested regions that are nearly the same. On images with perfectly flat shapes, such as the Disks test image, OpenCV finds no region at all. The worked example shows that a slight blur brings them back.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the extremal regions, the stability measure with delta, the limits, and the summary of each region in the table.

## Parameters

--8<-- "filters/mser-params.md"

## Implementation

`mser` in `engine/src/pixelnexus_engine/filters/mser.py` calls `cv2.MSER_create` with the catalog values and `detectRegions` on the 8-bit luma. For each region, `region_row` finds the centroid of its pixels, the radius sqrt(area / pi), and the long axis from the second moments of the pixels. The angle counts counterclockwise from the x axis, from 0 to 180 degrees, since an axis has no direction. The axis ratio is the square root of the ratio of the two moments along the axes. The rows are sorted by area, largest first. The pixels of the regions are not kept.

## Worked example

--8<-- "examples/mser.md"

## Complexity

--8<-- "filters/mser-complexity.md"

## Artifacts and limitations

--8<-- "filters/mser-limits.md"

## Tests

The detector must have the OpenCV defaults. For an ellipse with its long axis at 30 degrees, a row must give the centroid, the area, the equal-area radius, the angle of 30 degrees and the axis ratio. The table must hold what OpenCV finds on the blurred Disks image, 4 regions, sorted by area. The flat Disks image must give no region. The negated image must give the same table. The engine API tests check the JSON and the stages.

--8<-- "filters/mser-tests.md"

## References

--8<-- "filters/mser-references.md"
