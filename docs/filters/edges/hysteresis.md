# Hysteresis thresholding

--8<-- "filters/hysteresis-facts.md"

## Overview

Hysteresis thresholding turns a response map, such as a gradient magnitude, into a mask with two thresholds. Pixels above the high threshold are sure edges. Pixels above the low threshold are kept only when a chain of such pixels joins them to a sure edge. So long edges stay whole where they fade, and isolated weak responses, which are often noise, disappear.

<figure markdown="span">
  ![Four panels: the Sobel magnitude of disks shaded from dim to bright, a single low threshold that keeps small isolated spots, a single high threshold that breaks the dim outlines, and hysteresis that keeps whole outlines without the spots.](../../assets/figures/hysteresis-light.svg#only-light){ width="480" }
  ![Four panels: the Sobel magnitude of disks shaded from dim to bright, a single low threshold that keeps small isolated spots, a single high threshold that breaks the dim outlines, and hysteresis that keeps whole outlines without the spots.](../../assets/figures/hysteresis-dark.svg#only-dark){ width="480" }
  <figcaption>A low threshold alone keeps faint isolated spots. A high threshold alone breaks the dim outlines. Hysteresis keeps whole outlines and drops spots that touch no strong pixel.</figcaption>
</figure>

## How it works

1. Mark every pixel at or above the high threshold.
2. From each marked pixel, step to neighbors at or above the low threshold and mark them too.
3. Repeat until nothing changes. Marked pixels become 255, all others 0.

## Mathematical foundation

--8<-- "filters/hysteresis-formula.md"

A single threshold must choose between keeping noise and breaking edges. Canny proposed two thresholds to escape this choice. The result is the union of the connected parts of the low-threshold mask that contain at least one pixel of the high-threshold mask. With 8 neighbors, diagonal steps join pixels. With 4 neighbors, they do not, which is the default of scikit-image.

## Kernel or operator

There is no kernel. The Inspector shows the strong set, the weak set and the rule that joins them, with the current thresholds.

## Algorithm

--8<-- "filters/hysteresis-steps.md"

## Parameters

--8<-- "filters/hysteresis-params.md"

## Implementation

`hysteresis` in `web/src/core/filters/edges/hysteresis.ts` marks the strong pixels and grows them through weak neighbors with a stack, so each pixel is visited at most once. No border is needed, because paths stay inside the image. The filter runs in the browser engine through the shared filter framework in `web/src/core/filters/run.ts`, which handles the channel scope, alpha and the output mapping. It is a global filter. A path can cross the whole image, so the filter always runs on the whole image in one tile. A selection is cut out of the result. By default it works on luma.

## Worked example

--8<-- "examples/hysteresis.md"

## Complexity

--8<-- "filters/hysteresis-complexity.md"

## Artifacts and limitations

--8<-- "filters/hysteresis-limits.md"

## Tests

The reference labels the connected parts of the low-threshold mask with `scipy.ndimage.label` and keeps those with a strong pixel. Before the cases are written, the script checks it against `skimage.filters.apply_hysteresis_threshold`, which uses greater than and 4 neighbors, with both thresholds lowered by one half. The test covers 4 and 8 neighbors and a high threshold below the low one.

--8<-- "filters/hysteresis-tests.md"

## References

--8<-- "filters/hysteresis-references.md"
