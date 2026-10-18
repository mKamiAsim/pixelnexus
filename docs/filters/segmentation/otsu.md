# Otsu threshold

--8<-- "filters/otsu-facts.md"

## Overview

Otsu's method picks the global threshold from the histogram. It tries every level and keeps the one that makes the dark and the bright groups as different as possible. It needs no parameters.

<figure markdown="span">
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, where Otsu's level also turns the dark left half black.](../../assets/figures/otsu-light.svg#only-light){ width="480" }
  ![Two panels: a gray test page with rows of dark strokes, dark at the left and bright at the right, and the black and white result, where Otsu's level also turns the dark left half black.](../../assets/figures/otsu-dark.svg#only-dark){ width="480" }
  <figcaption>Otsu threshold on a page lit from the right.</figcaption>
</figure>

## How it works

1. Count the histogram of the levels.
2. For each level, measure how far apart the two groups are.
3. Threshold at the level where they are furthest apart.

## Mathematical foundation

--8<-- "filters/otsu-formula.md"

The total variance of the levels splits into a part within the two classes and a part between them. The total does not depend on t, so maximizing the between-class part minimizes the within-class part. Running sums of the counts and of the levels give each candidate in constant time.

## Kernel or operator

The Inspector shows the threshold rule as formulas with the current settings.

## Algorithm

--8<-- "filters/otsu-steps.md"

## Parameters

--8<-- "filters/otsu-params.md"

## Implementation

`otsuFilter` in `web/src/core/filters/segmentation/thresholds.ts` picks the level with `otsuThreshold`. It is global, since the histogram covers the whole image.

## Worked example

--8<-- "examples/otsu.md"

## Complexity

--8<-- "filters/otsu-complexity.md"

## Artifacts and limitations

--8<-- "filters/otsu-limits.md"

## Tests

The fixture cases come from scikit-image's threshold_otsu, which agrees with OpenCV's THRESH_OTSU on three test images on the random test plane, and compare every output pixel.

--8<-- "filters/otsu-tests.md"

## References

--8<-- "filters/otsu-references.md"
