# Histogram of Oriented Gradients

--8<-- "filters/hog-facts.md"

## Overview

The histogram of oriented gradients, HOG, describes the shape in each small cell of an image by the directions of its edges. Dalal and Triggs built it for detecting people. A classifier reads one long vector of all cell histograms. This filter shows the cell histograms the way scikit-image draws them. Each cell becomes a star of lines through its center, one per direction, as bright as the edges in that direction. It runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. A Siemens star with 12 black and white spokes. With cells of 8 pixels, the HOG view shows short lines along the spokes, and lines along the round edge of the star. With cells of 16 pixels, the lines are fewer and longer. On the texture test image, the stripes give a grid of vertical lines, the fine noise gives small stars with lines in all directions, the coarse noise gives faint short lines, and the flat gray stays almost black.](../../assets/figures/hog-light.svg#only-light){ width="480" }
  ![Four panels. A Siemens star with 12 black and white spokes. With cells of 8 pixels, the HOG view shows short lines along the spokes, and lines along the round edge of the star. With cells of 16 pixels, the lines are fewer and longer. On the texture test image, the stripes give a grid of vertical lines, the fine noise gives small stars with lines in all directions, the coarse noise gives faint short lines, and the flat gray stays almost black.](../../assets/figures/hog-dark.svg#only-dark){ width="480" }
  <figcaption>A Siemens star with 12 spokes and its HOG view with cells of 8 and 16 pixels. Then the view of the texture test image with stripes, fine noise, coarse noise and a flat gray, with cells of 8 pixels.</figcaption>
</figure>

## How it works

--8<-- "filters/hog-steps.md"

## Mathematical foundation

--8<-- "filters/hog-formula.md"

The direction is unsigned. A step up and a step down at the same angle fall into the same bin. So the descriptor does not care which side of an edge is brighter. Each pixel adds its gradient magnitude to the bin of its direction, so strong edges count more than faint ones.

Lighting changes the magnitude of the gradients. Dalal and Triggs therefore normalize groups of cells, the blocks, so that each block has the same total. Blocks overlap, so each cell is normalized several times, with different neighbors. With L2-Hys, the block vector is normalized to length 1, values above 0.2 are cut to 0.2, and the vector is normalized again.

## Kernel or operator

The gradient uses the centered difference [-1, 0, 1] in x and in y, without smoothing. Dalal and Triggs found that this simple kernel works best. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/hog-params.md"

## Implementation

`hog_filter` in `engine/src/pixelnexus_engine/filters/texture.py` calls `skimage.feature.hog` on the 8-bit luma with `visualize=True`. Here scikit-image puts each pixel into a single bin and divides each cell histogram by the number of pixels in the cell. Dalal and Triggs share each vote between neighboring bins and cells, and scikit-image does not. The view draws the cell histograms before the block normalization, so the block settings do not change it. Each line is drawn across its gradient direction, so it runs along the edges in the cell. The view is stretched so its brightest line is white. Cells that do not fit at the right and bottom edges are left out.

## Worked example

--8<-- "examples/hog.md"

## Complexity

--8<-- "filters/hog-complexity.md"

## Artifacts and limitations

--8<-- "filters/hog-limits.md"

## Tests

The view must be the visualization of scikit-image, stretched, for two block norms. Next to a vertical edge, the cell must show one near vertical line. The block size and norm must not change the view, and a flat image must give a black view. The engine API test runs the filter.

--8<-- "filters/hog-tests.md"

## References

--8<-- "filters/hog-references.md"
