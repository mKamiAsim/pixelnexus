# Deringing

--8<-- "filters/dering-facts.md"

## Overview

Deringing removes the ripples that JPEG compression and strong sharpening leave next to strong edges, also called ringing or mosquito noise. It finds the strong edges, marks a narrow zone around them, and smooths that zone with a bilateral filter, which keeps the edge itself. The rest of the image stays untouched. The zone rule is PixelNexus's own. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: a Siemens star saved as JPEG with quality 20, with ripples along the spokes; the deringed star with cleaner spokes; the zone, white over the whole star and black around it; and the original.](../../assets/figures/dering-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star saved as JPEG with quality 20, with ripples along the spokes; the deringed star with cleaner spokes; the zone, white over the whole star and black around it; and the original.](../../assets/figures/dering-dark.svg#only-dark){ width="480" }
  <figcaption>A Siemens star saved as JPEG with quality 20, the result with the defaults, the zone where the filter works, and the original. The star has strong edges everywhere, so the zone covers all of it.</figcaption>
</figure>

## How it works

1. Smooth the luma with a Gaussian of sigma 1 and take its Sobel gradient, divided by 8.
2. Mark the strong edges, where the gradient reaches the threshold.
3. Widen them by the zone radius and blur the result into a soft weight.
4. Smooth each channel with the bilateral filter and blend it in by that weight.

## Mathematical foundation

--8<-- "filters/dering-formula.md"

Ringing comes from rounding away the high frequencies near an edge. The edge then overshoots and wiggles, like a sharp step drawn with too few waves. The wiggles stay close to the edge, within its 8 x 8 block for JPEG. So the filter works only there. Inside the zone, the bilateral filter of Tomasi and Manduchi averages each pixel with neighbors of similar value. The ripples are small, below the range sigma, so they average out. The edge is large, far above the range sigma, so its two sides are not mixed. The soft weight avoids a visible border at the edge of the zone. The rule for the zone is a simple heuristic of PixelNexus, not a model of the ringing, so the filter is labeled approximate.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings: the strong edges, the zone and the blend.

## Algorithm

--8<-- "filters/dering-steps.md"

## Parameters

--8<-- "filters/dering-params.md"

## Implementation

`dering` in `engine/src/pixelnexus_engine/filters/artifacts.py` builds the zone with `edge_zone` on the luma, then blends `bilateral` into each channel the scope names. The function `bilateral` extends the plane with the border mode and calls `cv2.bilateralFilter` of OpenCV with a window radius of ceil(2 sigma_s). There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/dering.md"

## Complexity

--8<-- "filters/dering-complexity.md"

## Artifacts and limitations

--8<-- "filters/dering-limits.md"

## Tests

The test image is a step with ripples next to it. The zone must cover the edge and nothing far away. The ripples must drop by at least 3 dB, and pixels far from the edge must stay exactly. With a threshold above every edge, the image must stay exactly. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/dering-tests.md"

## References

--8<-- "filters/dering-references.md"
