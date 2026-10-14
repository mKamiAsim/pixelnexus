# Adaptive histogram equalization

--8<-- "filters/ahe-facts.md"

## Overview

Adaptive histogram equalization (AHE) equalizes each tile of a grid on its own, so every region uses the full range of levels. It brings out the faintest local detail, and it also turns noise in flat areas into strong grain. CLAHE adds a clip limit to prevent that. This filter is CLAHE without the limit.

<figure markdown="span">
  ![Three panels: low-contrast blurred disks with faint noise, the AHE result with strong grain everywhere, and the CLAHE result with a calm background.](../../assets/figures/ahe-light.svg#only-light){ width="480" }
  ![Three panels: low-contrast blurred disks with faint noise, the AHE result with strong grain everywhere, and the CLAHE result with a calm background.](../../assets/figures/ahe-dark.svg#only-dark){ width="480" }
  <figcaption>Low-contrast disks with faint noise, after AHE and after CLAHE with clip limit 2, both with 8 x 8 tiles.</figcaption>
</figure>

## How it works

1. Cut the image into a grid of tiles.
2. Build the histogram equalization curve of each tile.
3. For each pixel, blend the curves of the four nearest tile centers.

## Mathematical foundation

--8<-- "filters/ahe-formula.md"

Each tile curve is the scaled cumulative histogram of the tile. Pizer and colleagues compute it only at the tile centers and blend the curves bilinearly in between, which costs far less than one histogram per pixel. In a flat tile, nearly all pixels share a few levels, so the curve spreads those few levels over the whole range. That is why AHE raises noise in flat areas.

## Kernel or operator

The Inspector shows the stages as formulas: the tile grid, the tile histograms, the tile curves and the bilinear blend. The curves depend on the image. The Point-op curve in the Learn panel draws the blended curve at the probe pixel, and the histograms of the whole image before and after.

## Algorithm

--8<-- "filters/ahe-steps.md"

## Parameters

--8<-- "filters/ahe-params.md"

## Implementation

`aheFilter` in `web/src/core/filters/enhancement/clahe.ts` is the CLAHE code without a clip limit. The function `tileCurves` builds the curve of every tile, and `applyCurves` blends them per pixel. The function `curveAt` gives the blended curve at one pixel for the Point-op curve. The filter is global, since the tile grid covers the whole image.

## Worked example

--8<-- "examples/ahe.md"

## Complexity

--8<-- "filters/ahe-complexity.md"

## Artifacts and limitations

--8<-- "filters/ahe-limits.md"

## Tests

The reference follows the steps of cv::CLAHE with NumPy. Before the cases are written, a version that blends in 32-bit floats, as OpenCV does, must equal `cv2.createCLAHE` exactly on a test image, for four grids and clip limits. PixelNexus blends in 64-bit floats, which moves a rounded result by at most one level, on under 1 percent of the pixels in that test. More tests check that clipping keeps the pixel count, that one tile without a limit is rounded global equalization, and that each pixel gets the curve that `curveAt` reports.

--8<-- "filters/ahe-tests.md"

## References

--8<-- "filters/ahe-references.md"
