# Chan-Vese segmentation

--8<-- "filters/chan-vese-facts.md"

## Overview

Chan-Vese segmentation splits the image into two phases. Each phase should be as even in brightness as it can be, and the boundary between them as short as it can be. It never looks for edges. So it can follow a border that is soft, noisy or broken, where edge detectors give up. The two phases go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make a phase the selection. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. A bright disk and a gray square on a dark ground, with strong noise. The phases panel shows the disk and the square in green on a purple ground, with clean outlines. The mean colors panel shows the two objects in one mid gray on a dark gray ground. The level set panel is bright inside the objects and darker outside, with shades that change slowly across the ground.](../../assets/figures/chan-vese-light.svg#only-light){ width="480" }
  ![Four panels. A bright disk and a gray square on a dark ground, with strong noise. The phases panel shows the disk and the square in green on a purple ground, with clean outlines. The mean colors panel shows the two objects in one mid gray on a dark gray ground. The level set panel is bright inside the objects and darker outside, with shades that change slowly across the ground.](../../assets/figures/chan-vese-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 30. Then the two phases, each phase in its mean color, and the final level set with 0 at middle gray.</figcaption>
</figure>

## How it works

--8<-- "filters/chan-vese-steps.md"

## Mathematical foundation

--8<-- "filters/chan-vese-formula.md"

Chan and Vese wrote the boundary as the zero level of a function phi. The boundary can then split and merge without any extra work, so one start can find many objects. Their energy is a simple case of the Mumford-Shah model, where each phase is a flat color.

Each step has two parts. First it finds the two means. Then it moves phi so that each pixel leans toward the phase with the closer mean. The length term mu works against small wiggles and specks.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/chan-vese-params.md"

## Implementation

`chan_vese_filter` in `engine/src/pixelnexus_engine/filters/contours.py` calls `skimage.segmentation.chan_vese` on the luma from 0 to 1, and asks for the final level set. scikit-image scales the image to fill 0 to 1 first. It follows the scheme of Getreuer, leaves out the area term of the paper, and does not reset phi to a distance during the steps. It stops when the root mean square change of phi in one step is at most the tolerance, or after the most steps.

The phases output is a label map, with phase 1 (phi above 0) as label 1 and the rest as label 2. Which phase is the object depends on the start. The level set output shows phi with 0 at middle gray, scaled by its largest absolute value. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/chan-vese.md"

With the default length weight, phase 1 is the disk and the square, 2 parts, even with noise of sigma 30. With no length weight, every noisy pixel can switch on its own, and phase 1 breaks into hundreds of parts.

A length weight of 1 looks worse than 0.25, but the cause is the stop rule. A larger mu slows each step, so at noise sigma 10 the change falls below the tolerance after 47 steps, while small squares of the checkerboard start are still left. With a tolerance of 0.0001, phase 1 is 2 parts again.

## Complexity

--8<-- "filters/chan-vese-complexity.md"

## Artifacts and limitations

--8<-- "filters/chan-vese-limits.md"

## Tests

The level set must be scikit-image's on the luma. On a noisy disk, phase 1 must be exactly the disk, and the table must say 2 phases. The level set output must be at or above middle gray where phi is above 0. The boundaries must be those of scikit-image's `mark_boundaries`. The representation must have its four stages.

--8<-- "filters/chan-vese-tests.md"

## References

--8<-- "filters/chan-vese-references.md"
