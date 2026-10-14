# Global threshold

--8<-- "filters/threshold-global-facts.md"

## Overview

A global threshold turns the image black and white with one level for every pixel. Pixels above the level turn white, the others black. It is the simplest segmentation, and it works only when the lighting is even.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, where the left half of the page turns all black.](../../assets/figures/threshold-global-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, where the left half of the page turns all black.](../../assets/figures/threshold-global-dark.svg#only-dark){ width="480" }
  <figcaption>Global threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Compare each value with the threshold.
2. Write 255 above it and 0 at or below it.
3. With Invert, swap the two.

## Mathematical foundation

--8<-- "filters/threshold-global-formula.md"

A threshold splits the histogram in two. When objects and background form two separate peaks, any level between them separates them. Uneven lighting shifts the peaks from place to place, so no single level works everywhere, as the figure shows.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/threshold-global-steps.md"

## Parameters

--8<-- "filters/threshold-global-params.md"

## Implementation

`thresholdGlobalFilter` in `web/src/core/filters/segmentation/thresholds.ts`.

## Worked example

--8<-- "examples/threshold-global.md"

## Complexity

--8<-- "filters/threshold-global-complexity.md"

## Artifacts and limitations

--8<-- "filters/threshold-global-limits.md"

## Tests

The fixture cases come from a NumPy comparison on the random test plane, and compare every output pixel.

--8<-- "filters/threshold-global-tests.md"

## References

--8<-- "filters/threshold-global-references.md"
