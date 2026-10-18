# Pixelate

--8<-- "filters/pixelate-facts.md"

## Overview

Pixelate replaces each square block of the image with its mean color, so the image looks made of large pixels. It hides detail, and it gives a retro, low-resolution look.

<figure markdown="span">
  ![Three panels: a Siemens star with fine spokes, the star in blocks of 4 pixels, and the star in blocks of 8 pixels, where the center turns into a coarse pattern.](../../assets/figures/pixelate-light.svg#only-light){ width="560" }
  ![Three panels: a Siemens star with fine spokes, the star in blocks of 4 pixels, and the star in blocks of 8 pixels, where the center turns into a coarse pattern.](../../assets/figures/pixelate-dark.svg#only-dark){ width="560" }
  <figcaption>The Siemens star, and pixelate with blocks of 4 and 8 pixels.</figcaption>
</figure>

## How it works

1. Cut the image into square blocks, starting at the top-left corner.
2. Compute the mean of each block.
3. Fill the block with its mean.

## Mathematical foundation

--8<-- "filters/pixelate-formula.md"

Averaging a block removes all detail smaller than the block. But the blocks sample the image only once per block, so detail near the block size does not vanish cleanly. It turns into false patterns, which is aliasing. Near the center of the Siemens star, where the spokes are finest, the blocks show patterns that are not in the star.

## Kernel or operator

The Inspector shows the block mean with the current block size.

## Algorithm

--8<-- "filters/pixelate-steps.md"

## Parameters

--8<-- "filters/pixelate-params.md"

## Implementation

`pixelateFilter` in `web/src/core/filters/artistic/effects.ts` calls `pixelatePlane`. It is a global filter, so the blocks line up across the whole image and its tiles.

## Worked example

--8<-- "examples/pixelate.md"

## Complexity

--8<-- "filters/pixelate-complexity.md"

## Artifacts and limitations

--8<-- "filters/pixelate-limits.md"

## Tests

The fixture cases compare every pixel with NumPy block means for block sizes 2, 3, 4 and 8. These leave smaller blocks at the edges of the 13 by 10 test plane. Before the cases are written, the block means are checked against Pillow's reduce.

--8<-- "filters/pixelate-tests.md"

## References

--8<-- "filters/pixelate-references.md"
