# Hough transform for lines

--8<-- "filters/hough-lines-facts.md"

## Overview

The Hough transform finds straight lines by voting. First Canny finds the edge pixels. Then every edge pixel votes for all the lines that could pass through it. A line that many edge pixels share gets many votes, even when it has gaps or is partly hidden. The filter draws the found lines across the image, shows the accumulator of votes, or lists the lines in a table for the Features panel. It runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. The input has a bright triangle at the top left, a gray rectangle at the bottom right and a dashed diagonal line at the top right, on a dark ground. With the defaults, eight white lines run across the whole image along the sides of the triangle and the rectangle and along the dashed line, over the gray edges. The accumulator shows bright sine curves in its upper half that cross in a few bright spots. With three lines only, the long side of the triangle, its bottom side and the bottom of the rectangle remain.](../../assets/figures/hough-lines-light.svg#only-light){ width="480" }
  ![Four panels. The input has a bright triangle at the top left, a gray rectangle at the bottom right and a dashed diagonal line at the top right, on a dark ground. With the defaults, eight white lines run across the whole image along the sides of the triangle and the rectangle and along the dashed line, over the gray edges. The accumulator shows bright sine curves in its upper half that cross in a few bright spots. With three lines only, the long side of the triangle, its bottom side and the bottom of the rectangle remain.](../../assets/figures/hough-lines-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with a triangle, a rectangle and a dashed line. Then the lines found with the defaults in white over the Canny edges in gray, the accumulator, and the three strongest lines only.</figcaption>
</figure>

## How it works

--8<-- "filters/hough-lines-steps.md"

## Mathematical foundation

--8<-- "filters/hough-lines-formula.md"

A line y = m x + c cannot describe vertical lines, since m would be infinite. Duda and Hart used the normal form instead. Drop a perpendicular from the origin to the line. Its angle theta and its length rho describe the line, and both stay finite for every line.

Fix one edge pixel (x, y). The lines through it have rho = x cos theta + y sin theta, one for each theta. In the plane of theta and rho, this is a sine curve. Two edge pixels give two curves, which cross at the one line through both pixels. Many edge pixels on one line give many curves through one point. The accumulator counts the curves through each cell, and its peaks are the lines.

Each peak only needs enough pixels on the line, not a solid line, so dashed and broken lines are found too. The price is that the result is an infinite line. It does not tell where the edge pixels start and stop. Hough-based edge linking finds segments instead.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings: the Canny edges, the voting, and the peak search.

## Parameters

--8<-- "filters/hough-lines-params.md"

## Implementation

`hough_lines` in `engine/src/pixelnexus_engine/filters/hough.py` finds edges with `skimage.feature.canny` on the luma from 0 to 1, with the border mode as the mode of its smoothing. Then `skimage.transform.hough_line` builds the accumulator. It uses the given number of angles theta from -90 degrees up to, but not including, 90 degrees, and distances rho in steps of 1 pixel. The origin is the center of the top-left pixel. Then `hough_line_peaks` keeps peaks of at least the vote threshold times the largest vote, apart by the distance and angle limits, at most the given number.

Here scikit-image measures theta with y pointing down, so it turns clockwise on screen. The table gives the direction of each line instead, counterclockwise from the x axis from 0 to 180 degrees. It also gives the distance of the line from the origin, its votes, and the two points where it leaves the image. The lines output draws each line in white across the image, over the edges in gray (96).

The accumulator view is turned to our angles. From left to right, the normal of the line turns counterclockwise from -90 to 90 degrees. From bottom to top, the signed distance grows from minus to plus the length of the diagonal. All edge pixels have x and y of at least 0, so most votes fall in the upper half. The view shows log(1 + votes), which is our choice, so weak curves stay visible. It is resampled to the size of the image and stretched.

## Worked example

--8<-- "examples/hough-lines.md"

The three sides of the triangle are found at 74, 126 and 0 degrees. The dashed line, at 135 degrees on screen, is found at 136, though its dashes cover only about 60 percent of it. The rectangle gives four lines near 0 and 90 degrees, three of them a degree off. Its sides are short, so lines a degree apart collect almost the same votes.

## Complexity

--8<-- "filters/hough-lines-complexity.md"

## Artifacts and limitations

--8<-- "filters/hough-lines-limits.md"

## Tests

The edges must be scikit-image's Canny with the mapped border mode. A horizontal and a vertical line of edge pixels must give the directions 0 and 90 degrees, their distances, their votes and their end points. Falling and rising diagonals must give 135 and 45 degrees. The table must hold the peaks of scikit-image, strongest first. The accumulator view must put a horizontal line at the right edge, below the middle. The lines output must draw white lines over gray edges, and a flat image must give no lines and a black accumulator. The engine API test runs the filter.

--8<-- "filters/hough-lines-tests.md"

## References

--8<-- "filters/hough-lines-references.md"
