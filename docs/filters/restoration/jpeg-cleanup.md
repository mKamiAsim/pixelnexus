# JPEG artifact removal (classical)

--8<-- "filters/jpeg-cleanup-facts.md"

## Overview

JPEG artifact removal cleans strongly compressed JPEG images in two steps, with no learned model. Deblocking re-applies JPEG on shifted grids and averages the results, which hides the 8 x 8 blocks. Deringing then smooths the ripples next to strong edges. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: a Siemens star saved as JPEG with quality 20, with blocky, rippled spokes; the cleaned star, with smooth, clean spokes; the result with one grid, which only removes ripples; and the original.](../../assets/figures/jpeg-cleanup-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star saved as JPEG with quality 20, with blocky, rippled spokes; the cleaned star, with smooth, clean spokes; the result with one grid, which only removes ripples; and the original.](../../assets/figures/jpeg-cleanup-dark.svg#only-dark){ width="480" }
  <figcaption>A Siemens star saved as JPEG with quality 20, the result with the defaults and quality 20, the result with one grid, and the original.</figcaption>
</figure>

## How it works

1. Deblock: re-apply JPEG on shifted 8 x 8 grids in the Y'CbCr of JFIF and average.
2. Find the strong edges of the deblocked luma and build a soft zone around them.
3. Smooth the zone with the bilateral filter and blend it in.

## Mathematical foundation

--8<-- "filters/jpeg-cleanup-formula.md"

JPEG damage has two parts. The blocks come from rounding each 8 x 8 block on its own. The ripples come from rounding away the fine detail next to strong edges. The deblocking filter handles the first, and also some of the second. The deringing filter handles what is left near strong edges. See those two pages for the details. A learned JPEG restoration model is planned in Phase 7, and this filter is the classical baseline to compare it with.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings: the four stages of deblocking followed by the three stages of deringing.

## Algorithm

--8<-- "filters/jpeg-cleanup-steps.md"

## Parameters

--8<-- "filters/jpeg-cleanup-params.md"

## Implementation

`jpeg_cleanup` in `engine/src/pixelnexus_engine/filters/artifacts.py` runs `deblock_image`, then `dering_planes` with the same parameters. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/jpeg-cleanup.md"

## Complexity

--8<-- "filters/jpeg-cleanup-complexity.md"

## Artifacts and limitations

--8<-- "filters/jpeg-cleanup-limits.md"

## Tests

The result must equal deringing applied to the output of deblocking. The two steps are tested on their own pages. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/jpeg-cleanup-tests.md"

## References

--8<-- "filters/jpeg-cleanup-references.md"
