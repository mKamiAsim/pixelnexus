# Local Ternary Pattern

--8<-- "filters/ltp-facts.md"

## Overview

A local ternary pattern works like a local binary pattern, with one change. A neighbor within a threshold t of the center counts as about the same, neither brighter nor darker. Tan and Triggs added this dead band so that small noise in flat areas no longer flips the code. The three states give too many codes for a histogram, so the pattern is split into two binary codes. The upper code marks the clearly brighter neighbors, and the lower code the clearly darker ones. The filter shows one of them as a gray image, or counts both in a histogram table. It runs in the PixelNexus engine.

<figure markdown="span">
  ![Four panels. The input has vertical stripes at the top left, fine noise at the top right, coarse blurred noise at the bottom left and a flat gray at the bottom right. With the threshold 0, the upper code fills the flat gray with speckle like the fine noise. With the threshold 5, the flat gray turns mostly black with scattered white dots in both codes. The other three quarters keep their patterns.](../../assets/figures/ltp-light.svg#only-light){ width="480" }
  ![Four panels. The input has vertical stripes at the top left, fine noise at the top right, coarse blurred noise at the bottom left and a flat gray at the bottom right. With the threshold 0, the upper code fills the flat gray with speckle like the fine noise. With the threshold 5, the flat gray turns mostly black with scattered white dots in both codes. The other three quarters keep their patterns.](../../assets/figures/ltp-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with four textures: stripes, fine noise, coarse noise and a flat gray with faint noise. Then the upper code with the thresholds 0 and 5, and the lower code with the threshold 5.</figcaption>
</figure>

## How it works

--8<-- "filters/ltp-steps.md"

## Mathematical foundation

--8<-- "filters/ltp-formula.md"

In a flat area with noise, every difference between a neighbor and the center is small. A binary pattern still turns each of them into a bit, so the code is random. With the dead band, differences smaller than t give 0 in both codes, and the code of a flat area is 0.

The price is that t is in gray levels. Doubling the contrast of the image moves more differences past t, so the codes are no longer independent of the contrast as binary patterns are. Adding a constant still keeps them, away from the image edge.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages: the ternary comparison with the current threshold, and the upper and lower codes.

## Parameters

--8<-- "filters/ltp-params.md"

## Implementation

`ltp` in `engine/src/pixelnexus_engine/filters/texture.py` is PixelNexus's own code. It pads the 8-bit luma by one pixel with the border mode and compares each of the 8 neighbors with the center. Bit k of both codes belongs to the neighbor at 45 k degrees, counterclockwise from the right: right, up right, up, up left, left, down left, down and down right. A code goes into the image as it is, from 0 to 255. The histogram table has one row for each of the 256 codes, with the count of the upper and of the lower code. Tan and Triggs use neighbors on a circle of any radius. This version uses the 8 direct neighbors only.

## Worked example

--8<-- "examples/ltp.md"

With t = 0, every neighbor counts as brighter or darker, so no pixel is quiet. The flat quarter, with noise of sigma 2, is quiet at t = 5 in about half of its pixels and almost everywhere at t = 10. The stripes and the fine noise have large differences, so they keep their codes. About a fifth of the coarse noise is quiet at t = 10, where its slopes are gentle.

## Complexity

--8<-- "filters/ltp-complexity.md"

## Artifacts and limitations

--8<-- "filters/ltp-limits.md"

## Tests

The codes must match a direct loop over every pixel and neighbor for several thresholds and border modes. A single bright neighbor must set bit k for the neighbor at 45 k degrees. A flat area with noise smaller than t must give 0 in both codes, where a binary pattern gives many codes. With t = 0, a flat image must set every bit of both codes. The outputs must be the codes and their histograms. The engine API test runs the filter.

--8<-- "filters/ltp-tests.md"

## References

--8<-- "filters/ltp-references.md"
