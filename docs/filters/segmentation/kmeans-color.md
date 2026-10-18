# K-means color segmentation

--8<-- "filters/kmeans-color-facts.md"

## Overview

K-means groups the colors of an image into k clusters. Each cluster has a center, the mean of its colors, and every pixel is painted with the center of its cluster. The image then holds only k colors, chosen to suit it.

<figure markdown="span">
  ![Three panels: a hue sweep with all hues from left to right fading to white at the bottom, the sweep with 4 colors in broad bands, and the sweep with 16 colors in narrower bands.](../../assets/figures/kmeans-color-light.svg#only-light){ width="560" }
  ![Three panels: a hue sweep with all hues from left to right fading to white at the bottom, the sweep with 4 colors in broad bands, and the sweep with 16 colors in narrower bands.](../../assets/figures/kmeans-color-dark.svg#only-dark){ width="560" }
  <figcaption>The hue sweep, and k-means color segmentation with 4 and 16 clusters.</figcaption>
</figure>

## How it works

1. Choose k start colors.
2. Give each pixel the start color nearest to its own color.
3. Move each center to the mean color of its pixels.
4. Repeat the last two steps until no pixel changes cluster.

## Mathematical foundation

--8<-- "filters/kmeans-color-formula.md"

K-means looks for the k centers with the smallest sum of squared distances from each color to its center. Lloyd's two steps never raise that sum, but they can stop in a local minimum. That is why the start matters, and why PixelNexus uses a start that does not depend on chance.

## Kernel or operator

The Inspector shows the start rule, the assign step and the update step.

## Algorithm

--8<-- "filters/kmeans-color-steps.md"

## Parameters

--8<-- "filters/kmeans-color-params.md"

## Implementation

`kmeansColorFilter` in `web/src/core/filters/segmentation/regions.ts` calls `kmeansColors`. A photo has far fewer distinct colors than pixels, so the steps run over the distinct colors, each weighted by its count.

## Worked example

--8<-- "examples/kmeans-color.md"

## Complexity

--8<-- "filters/kmeans-color-complexity.md"

## Artifacts and limitations

--8<-- "filters/kmeans-color-limits.md"

## Tests

The fixture cases compare every pixel with a NumPy version of the same steps, for several k, an early stop after two iterations, and both views. Before the cases are written, the NumPy version is checked against cv2.kmeans started from the same first assignment, which must end at the same centers and labels. Unit tests check two groups of colors and an image with fewer colors than k.

--8<-- "filters/kmeans-color-tests.md"

## References

--8<-- "filters/kmeans-color-references.md"
