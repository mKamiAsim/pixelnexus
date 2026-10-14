# CLAHE

--8<-- "filters/clahe-facts.md"

## Overview

CLAHE, contrast limited adaptive histogram equalization, equalizes each tile of a grid on its own. A clip limit caps how much any tile may raise the contrast, so flat areas and noise are not stretched too far. The tile curves are blended smoothly, so no tile edges show. It is the usual choice for local contrast in medical images and in photos with deep shadows.

<figure markdown="span">
  ![Three panels: low-contrast blurred disks with faint noise, the globally equalized image with strong grain in the background, and the CLAHE result with clearer disks and calm background.](../../assets/figures/clahe-light.svg#only-light){ width="480" }
  ![Three panels: low-contrast blurred disks with faint noise, the globally equalized image with strong grain in the background, and the CLAHE result with clearer disks and calm background.](../../assets/figures/clahe-dark.svg#only-dark){ width="480" }
  <figcaption>Low-contrast disks with faint noise, after histogram equalization and after CLAHE with 8 x 8 tiles and clip limit 2.</figcaption>
</figure>

## How it works

1. Cut the image into a grid of tiles.
2. Count the histogram of each tile.
3. Clip the tall bins at the limit and spread the clipped pixels over all bins.
4. Turn each histogram into an equalization curve.
5. For each pixel, blend the curves of the four nearest tile centers.

## Mathematical foundation

--8<-- "filters/clahe-formula.md"

The slope of an equalization curve at a level is proportional to the number of pixels at that level. A flat tile has one tall bin, so its curve is very steep there and small differences such as noise become large. Clipping the histogram at beta caps the slope. With the clip limit c of OpenCV, beta is about c times the average bin count, so the slope stays near c or below. Pizer and colleagues and Zuiderveld describe this contrast limit and the bilinear blend between tile centers.

## Kernel or operator

The Inspector shows the stages as formulas: the tile grid, the tile histograms, the tile curves and the bilinear blend. The curves depend on the image. The Point-op curve in the Learn panel draws the blended curve at the probe pixel, and the histograms of the whole image before and after.

## Algorithm

--8<-- "filters/clahe-steps.md"

## Parameters

--8<-- "filters/clahe-params.md"

## Implementation

`claheFilter` in `web/src/core/filters/enhancement/clahe.ts`. The function `tileCurves` builds the curve of every tile, and `applyCurves` blends them per pixel. The function `curveAt` gives the blended curve at one pixel for the Point-op curve. The filter is global, since the tile grid covers the whole image.

## Worked example

--8<-- "examples/clahe.md"

## Complexity

--8<-- "filters/clahe-complexity.md"

## Artifacts and limitations

--8<-- "filters/clahe-limits.md"

## Tests

The reference follows the steps of cv::CLAHE with NumPy. Before the cases are written, a version that blends in 32-bit floats, as OpenCV does, must equal `cv2.createCLAHE` exactly on a test image, for four grids and clip limits. PixelNexus blends in 64-bit floats, which moves a rounded result by at most one level, on under 1 percent of the pixels in that test. More tests check that clipping keeps the pixel count, that one tile without a limit is rounded global equalization, and that each pixel gets the curve that `curveAt` reports.

--8<-- "filters/clahe-tests.md"

## References

--8<-- "filters/clahe-references.md"
