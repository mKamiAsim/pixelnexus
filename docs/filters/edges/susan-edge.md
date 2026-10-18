# SUSAN edge detector

--8<-- "filters/susan-edge-facts.md"

## Overview

The SUSAN edge detector of Smith and Brady finds edges by counting, like the [SUSAN corner detector](../features/susan-corner.md). Around each pixel it places a small disk of 37 pixels and counts how many are about as bright as the center pixel. A flat area fills the disk. On an edge, about half of it is filled. Where the count falls below three quarters of the disk, the pixel lies near an edge, and the smaller the count, the stronger the edge. The detector takes no derivatives. The filter runs in the PixelNexus engine, in PixelNexus's own code.

<figure markdown="span">
  ![Four panels. A noisy bright disk and gray square on a dark ground. The edge response with a brightness threshold of 25 shows a bright soft ring around each shape and scattered white dots over the whole image. The edges at 25 trace both outlines as thin lines, with about thirty short stray strokes around them. The edges at 40 trace both outlines cleanly, with no stray strokes.](../../assets/figures/susan-edge-light.svg#only-light){ width="480" }
  ![Four panels. A noisy bright disk and gray square on a dark ground. The edge response with a brightness threshold of 25 shows a bright soft ring around each shape and scattered white dots over the whole image. The edges at 25 trace both outlines as thin lines, with about thirty short stray strokes around them. The edges at 40 trace both outlines cleanly, with no stray strokes.](../../assets/figures/susan-edge-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 10. Then the SUSAN edge response with a brightness threshold of 25, and the edges with thresholds of 25 and 40.</figcaption>
</figure>

## How it works

--8<-- "filters/susan-edge-steps.md"

## Mathematical foundation

--8<-- "filters/susan-edge-formula.md"

The count n is called the USAN area, for univalue segment assimilating nucleus. The similarity of a pixel to the nucleus is a smooth step, exp(-(d / t)^6), where d is their difference in brightness. The paper sets the geometric threshold g to three quarters of the largest area. From its analysis of noise, this rejects noise best. A step edge of any curve still gives an area of at most three quarters on one side, so real edges are not lost.

The edge direction comes from the USAN itself. On a step edge, the USAN lies on one side, and the vector from the nucleus to its center of gravity crosses the edge. When the nucleus sits on a thin band between two regions, the USAN is a thin line along the edge instead. Then the longest axis of the USAN, found from its second moments, gives the direction. The paper uses the thin line case when the area is under the mask diameter, or when the center of gravity is less than 1 pixel from the nucleus.

## Kernel or operator

The mask is a circle of 37 pixels with a radius of 3.4. The rule is not a weighted sum, so there is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/susan-edge-params.md"

## Implementation

`susan_edge` in `engine/src/pixelnexus_engine/filters/susan.py` shares the mask and the similarity with the SUSAN corner detector. It sums the similarity and its moments over the 37 offsets with NumPy. For the longest axis it takes the angle 0.5 atan2(2 Sxy, Sxx - Syy) of the second moments. The paper gives the moments, and this angle is our form of its rule. Non-maximum suppression keeps a pixel when its response is at least that of both neighbors along the normal, rounded to one of four directions. The paper then applies binary thinning rules, which also remove noise points. They are in a report we could not read. In their place, pieces shorter than the minimum length are removed with `skimage.morphology.remove_small_objects`.

## Worked example

--8<-- "examples/susan-edge.md"

The brightness threshold does most of the work against noise. With the noise of sigma 10, a threshold of 25 leaves many stray pieces, and only 14.5 percent of the edge pixels lie near the outline. A minimum length of 5 raises that to 73.2 percent. At a threshold of 40, every edge pixel lies near the outline, and the whole outline is found. At 60, the threshold is close to the contrast of the square, 110 levels before the blur, and less than two thirds of the outline is found.

## Complexity

--8<-- "filters/susan-edge-complexity.md"

## Artifacts and limitations

--8<-- "filters/susan-edge-limits.md"

## Tests

The area and the moments must equal a brute-force sum over the mask, to 1e-12. The response must follow the rule of the paper, and a flat area must have the full area and no response. On straight edges at 0, 45, 90 and 135 degrees, the normal must cross the edge. On a one pixel line, the thin line case must give a normal across the line. A step must give a thin line of edges along its whole length, and a noisy disk edges all the way around within 2 pixels of the circle. The minimum length must only remove pixels. The outputs and the representation are checked too.

--8<-- "filters/susan-edge-tests.md"

## References

--8<-- "filters/susan-edge-references.md"
