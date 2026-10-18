# FAST corner detector

--8<-- "filters/fast-facts.md"

## Overview

FAST, short for features from accelerated segment test, finds corners with comparisons only. It reads 16 pixels on a circle around each pixel. When a long run of them is all clearly brighter or all clearly darker than the center, the pixel is a corner. A score then lets non-maximum suppression keep one point per corner.

<figure markdown="span">
  ![Three panels: two bright rectangles and a bright triangle on a dark background, the FAST score with small bright spots at the corners, and the corner points as single white dots at the eleven corners.](../../assets/figures/fast-light.svg#only-light){ width="480" }
  ![Three panels: two bright rectangles and a bright triangle on a dark background, the FAST score with small bright spots at the corners, and the corner points as single white dots at the eleven corners.](../../assets/figures/fast-dark.svg#only-dark){ width="480" }
  <figcaption>FAST on bright shapes. The score is high at the corners, and the corner points mark them.</figcaption>
</figure>

## How it works

1. Read the 16 pixels on a circle of radius 3 around each pixel.
2. Look for at least n of them in a row that are all brighter than the center plus the threshold, or all darker than the center minus it.
3. Score the pixels that pass by the summed contrast above the threshold.
4. For corner points, keep the pixels whose score is the largest nearby.

## Mathematical foundation

--8<-- "filters/fast-formula.md"

Along a straight edge, about half the circle is brighter and half is darker, so runs stay at about 8 pixels. At a corner, one side of the circle covers much more than half, so a run of 9 or more appears. Rosten and Drummond used machine learning to order the tests for speed, which does not change the result. The score sums |I - I_p| - t over the brighter or the darker circle pixels, whichever sum is larger.

## Kernel or operator

There is no kernel. The Inspector lists the segment test and the score with the current run length and threshold.

## Algorithm

--8<-- "filters/fast-steps.md"

## Parameters

--8<-- "filters/fast-params.md"

## Implementation

`fastScore` in `web/src/core/filters/features/corners.ts` runs the segment test on every pixel and scores the pixels that pass. The filter extends the plane once by the support with the border mode, so strips and whole images agree. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/fast.md"

## Complexity

--8<-- "filters/fast-complexity.md"

## Artifacts and limitations

--8<-- "filters/fast-limits.md"

## Tests

The reference runs the same test and score with NumPy. Before the cases are written, the script checks that the segment test finds the same corners as `skimage.feature.corner_fast` on a random image. The reference rounds scores to 32-bit floats before comparing neighbors, as the filter does, so ties next to a reflected border agree. The cases cover two run lengths and thresholds and both outputs for all five border modes.

--8<-- "filters/fast-tests.md"

## References

--8<-- "filters/fast-references.md"
