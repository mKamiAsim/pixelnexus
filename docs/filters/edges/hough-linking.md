# Hough-based edge linking

--8<-- "filters/hough-linking-facts.md"

## Overview

Canny gives edge pixels, not lines. Edge linking joins the pixels that lie on a straight line into segments, each with a start and an end. This filter uses the progressive probabilistic Hough transform of Matas, Galambos and Kittler. Edge pixels vote one at a time, in random order. As soon as a line has enough votes, its segment is traced along the edge pixels and removed. The result shows the segments over the edges, or lists them in a table. It runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. The input has a bright triangle, a gray rectangle and a dashed diagonal line. With the defaults, white segments cover the three sides of the triangle, the long sides of the rectangle and both edges of the dashed line, while the short sides of the rectangle stay gray. With the shortest segment 20, the short sides of the rectangle turn white too. With no gap allowed, the dashed line stays gray, and one side of the triangle is only partly white.](../../assets/figures/hough-linking-light.svg#only-light){ width="480" }
  ![Four panels. The input has a bright triangle, a gray rectangle and a dashed diagonal line. With the defaults, white segments cover the three sides of the triangle, the long sides of the rectangle and both edges of the dashed line, while the short sides of the rectangle stay gray. With the shortest segment 20, the short sides of the rectangle turn white too. With no gap allowed, the dashed line stays gray, and one side of the triangle is only partly white.](../../assets/figures/hough-linking-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with a triangle, a rectangle and a dashed line. Then the segments in white over the Canny edges in gray with the defaults, with the shortest segment 20, and with the shortest segment 20 and the largest gap 0.</figcaption>
</figure>

## How it works

--8<-- "filters/hough-linking-steps.md"

## Mathematical foundation

--8<-- "filters/hough-linking-formula.md"

The standard Hough transform lets every edge pixel vote and then looks for peaks. That finds infinite lines, and it is slow when there are many edge pixels. The progressive version stops voting as soon as one line is clear. Then it walks along that line from the pixel that voted last, in both directions, as long as it meets edge pixels or gaps up to the largest gap. That walk gives the start and end of the segment. The pixels of a kept segment leave the edges and take their votes back. Later lines then do not get votes from pixels that already belong to a segment.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings: the Canny edges, the random voting, and the segment limits.

## Parameters

--8<-- "filters/hough-linking-params.md"

## Implementation

`hough_linking` in `engine/src/pixelnexus_engine/filters/hough.py` finds edges with `skimage.feature.canny` on the luma from 0 to 1. Then `skimage.transform.probabilistic_hough_line` finds the segments with the given angles, vote threshold, shortest length and largest gap. Its seed is fixed at 0, so the same image gives the same segments. Here scikit-image keeps a segment when its extent in x or in y reaches the shortest length, so a diagonal segment must be a little longer than that. Segments that are too short keep their pixels and their votes. The table gives the end points, the length and the direction of each segment, longest first. The direction counts counterclockwise from the x axis, from 0 to 180 degrees. The image draws the segments in white over the edges in gray (96), so gray edges are the ones no segment took.

## Worked example

--8<-- "examples/hough-linking.md"

With no gap allowed, the dashed line stays unlinked, since each dash spans less than 20 pixels in x and in y. Allowing a gap of 3 nearly doubles the total length. A gap of 10 also bridges the gaps of the dashed line. Lowering the shortest segment from 50 to 20 adds the short sides of the rectangle, which are 40 pixels long.

## Complexity

--8<-- "filters/hough-linking-complexity.md"

## Artifacts and limitations

--8<-- "filters/hough-linking-limits.md"

## Tests

The segments must be those of scikit-image's probabilistic Hough transform with seed 0, the same on every run. A horizontal and a vertical run of edge pixels must give segments at 0 and 90 degrees with their lengths. The image must show only black, gray edges and white segments, and the table must list the segments. The engine API test runs the filter.

--8<-- "filters/hough-linking-tests.md"

## References

--8<-- "filters/hough-linking-references.md"
