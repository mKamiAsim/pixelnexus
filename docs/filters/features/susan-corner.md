# SUSAN corner detector

--8<-- "filters/susan-corner-facts.md"

## Overview

The SUSAN corner detector of Smith and Brady finds corners by counting. Around each pixel it places a small disk of 37 pixels and counts how many of them are about as bright as the center pixel. In a flat area all of them are. On a straight edge about half are. At a corner, fewer are. So a small count marks a corner. The detector takes no derivatives at all. The corners go to the Features panel and are drawn on the canvas as small crosses. The filter runs in the PixelNexus engine, in PixelNexus's own code.

<figure markdown="span">
  ![Three panels with corners marked by crosses. On the bright rectangle, one cross sits at each of its four corners and nowhere else. On the Siemens star with 12 spokes, crosses line the rim and the spoke edges near the center. On the Disks image, crosses line the round edges of every disk and mark the single bright pixels.](../../assets/figures/susan-corner-light.svg#only-light){ width="480" }
  ![Three panels with corners marked by crosses. On the bright rectangle, one cross sits at each of its four corners and nowhere else. On the Siemens star with 12 spokes, crosses line the rim and the spoke edges near the center. On the Disks image, crosses line the round edges of every disk and mark the single bright pixels.](../../assets/figures/susan-corner-dark.svg#only-dark){ width="480" }
  <figcaption>The corners SUSAN finds with the defaults on a bright rectangle, a Siemens star with 12 spokes and the Disks image, each marked with a cross.</figcaption>
</figure>

## How it works

--8<-- "filters/susan-corner-steps.md"

## Mathematical foundation

--8<-- "filters/susan-corner-formula.md"

USAN stands for univalue segment assimilating nucleus. The nucleus is the center pixel. Its USAN is the part of the disk with about the same brightness, and the USAN area n is its size. SUSAN, the smallest USAN, finds corners as the places where this area is smallest.

The similarity of a pixel to the nucleus is a smooth step, exp(-(d / t)^6), where d is their difference in brightness. It is close to 1 for differences well below t and drops fast to 0 above it. The power 6 makes the step sharp but smooth, so small changes of t do not flip pixels in and out. The geometric threshold g sets how small the area must be. Half of the 37 pixels, as in the paper, lies a little below the area of a straight edge. So edges give no response. Only places where less than half the disk is similar respond. The response R = g - n grows as the corner gets sharper.

The paper adds further tests on the shape of the USAN to remove false corners. PixelNexus leaves them out, so curved edges also give corners.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the mask, the USAN area with the brightness threshold, the response with the geometric threshold, and the non-maximum suppression.

## Parameters

--8<-- "filters/susan-corner-params.md"

## Implementation

`susan_corner` in `engine/src/pixelnexus_engine/filters/susan.py` pads the luma with the border mode and adds the similarity of each of the 37 shifted copies to the image. Then it keeps the pixels whose response is above 0 and the largest in their 5 x 5 neighborhood. The 5 x 5 window is PixelNexus's choice. Touching equal maxima give one corner, the first in reading order. The table has x and y, the response and the USAN area.

## Worked example

--8<-- "examples/susan-corner.md"

## Complexity

--8<-- "filters/susan-corner-complexity.md"

## Artifacts and limitations

--8<-- "filters/susan-corner-limits.md"

## Tests

The mask must have 37 pixels within a radius of 3.4. The USAN area must equal a brute-force sum with three nested loops, to 1e-12. A flat area must have the full area of 37 and no corners. A rectangle must give exactly its four corner pixels for brightness thresholds of 10, 25 and 40. A straight edge must have about half the area. The engine API tests check the JSON and the stages.

--8<-- "filters/susan-corner-tests.md"

## References

--8<-- "filters/susan-corner-references.md"
