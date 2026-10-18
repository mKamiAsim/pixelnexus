# Deblocking

--8<-- "filters/deblock-facts.md"

## Overview

Deblocking hides the 8 x 8 blocks of strongly compressed JPEG images. It uses Nosratinia's re-application of JPEG: shift the image within the 8 x 8 grid, compress it again with the same quality, shift it back, and average over many shifts. The new blocks straddle the old block edges, so the average is smooth there. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: a Siemens star saved as JPEG with quality 20, with blocky, noisy spoke edges; the deblocked star, with cleaner spokes; the result with one grid, which looks like the JPEG; and the original.](../../assets/figures/deblock-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star saved as JPEG with quality 20, with blocky, noisy spoke edges; the deblocked star, with cleaner spokes; the result with one grid, which looks like the JPEG; and the original.](../../assets/figures/deblock-dark.svg#only-dark){ width="480" }
  <figcaption>A Siemens star saved as JPEG with quality 20, the result with the defaults and quality 20, the result with one grid only, which changes almost nothing, and the original.</figcaption>
</figure>

## How it works

1. Convert to the Y'CbCr of JFIF, as JPEG does.
2. Build the quantization tables for the quality, as the IJG library does.
3. For each shift of the grid, cut the shifted plane into 8 x 8 blocks and take their DCT. Round each coefficient to a multiple of its table entry, and transform back.
4. Shift back and average over all shifts.
5. Convert back to RGB.

## Mathematical foundation

--8<-- "filters/deblock-formula.md"

JPEG loses detail in one step: it rounds the DCT coefficients of each 8 x 8 block to multiples of a quantization table. Each block is rounded on its own, so neighboring blocks no longer meet smoothly. Nosratinia noticed that the decoded image already satisfies the rounding on its own grid, so compressing it again there changes almost nothing. On a shifted grid, the rounding acts across the old block edges and smooths them. Each shifted copy is a slightly different estimate of the original, and their average is better than any one of them. The tables are those of ITU-T T.81 Annex K, scaled for the quality as the IJG library does, so they match most JPEG files. The filter must be told the quality, since it gets pixels, not the file.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the color conversion, the quantization table with its first row, the re-application on one block, and the average over the shifts.

## Algorithm

--8<-- "filters/deblock-steps.md"

## Parameters

--8<-- "filters/deblock-params.md"

## Implementation

`deblock` in `engine/src/pixelnexus_engine/filters/artifacts.py` converts with `jfif_ycbcr`, runs `deblock_plane` on Y, and on Cb and Cr unless only luma is asked for, and converts back with `jfif_rgb`. The function `quantization_table` builds the tables, and the function `requantize` does the lossy step with `scipy.fft.dctn` and `idctn` on all blocks at once. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/deblock.md"

## Complexity

--8<-- "filters/deblock-complexity.md"

## Artifacts and limitations

--8<-- "filters/deblock-limits.md"

## Tests

The quantization tables must equal those of libjpeg, read from JPEG files that Pillow writes, for qualities from 1 to 100. The JFIF color conversion must match Pillow to one level and invert. With one grid, a decoded JPEG must come back almost unchanged. With 64 grids, a JPEG of quality 20 must come at least 0.3 dB closer to the original. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/deblock-tests.md"

## References

--8<-- "filters/deblock-references.md"
