# Region growing

--8<-- "filters/region-growing-facts.md"

## Overview

Region growing starts from one pixel, the seed, and spreads to the neighbors that look like it. It stops where the image becomes too different from the seed. The result is a mask of one connected area, such as an object or a background.

<figure markdown="span">
  ![Four panels: noisy gray disks on a dark background, then the region grown from the largest disk with three tolerances: a disk full of holes, the whole disk, and a large area that has leaked into the background.](../../assets/figures/region-growing-light.svg#only-light){ width="640" }
  ![Four panels: noisy gray disks on a dark background, then the region grown from the largest disk with three tolerances: a disk full of holes, the whole disk, and a large area that has leaked into the background.](../../assets/figures/region-growing-dark.svg#only-dark){ width="640" }
  <figcaption>Noisy disks, and the region grown from a seed in the largest disk with tolerances 20, 80 and 200.</figcaption>
</figure>

## How it works

1. Find the seed pixel from its position.
2. Mark every pixel whose value is within the tolerance of the seed's value.
3. Keep only the marked pixels that connect to the seed through marked pixels.

## Mathematical foundation

--8<-- "filters/region-growing-formula.md"

The tolerance trades holes against leaks. A pixel inside the object is left out when noise moves it more than the tolerance from the seed. A pixel outside joins when the tolerance reaches across the step between object and background. A good tolerance is larger than the noise and smaller than that step.

## Kernel or operator

The Inspector shows the seed, the match test and the growth rule with the current settings.

## Algorithm

--8<-- "filters/region-growing-steps.md"

## Parameters

--8<-- "filters/region-growing-params.md"

## Implementation

`regionGrowingFilter` in `web/src/core/filters/segmentation/regions.ts` marks the matching pixels and keeps the component of the seed with `labelComponents`.

## Worked example

--8<-- "examples/region-growing.md"

## Complexity

--8<-- "filters/region-growing-complexity.md"

## Artifacts and limitations

--8<-- "filters/region-growing-limits.md"

## Tests

The fixture cases compare every pixel with skimage.segmentation.flood on the brightness, with 4 and 8 neighbors. For the color measure, they use the same flood on the largest channel difference. No brightness lies on the tolerance, so rounding cannot move a pixel across it. Unit tests check the seed position and that a matching area not connected to the seed stays out.

--8<-- "filters/region-growing-tests.md"

## References

--8<-- "filters/region-growing-references.md"
