# Local Binary Pattern

--8<-- "filters/lbp-facts.md"

## Overview

A local binary pattern describes the texture around each pixel with a small code. P points on a circle around the pixel each give one bit: 1 when the point is at least as bright as the center. Ojala, Pietikainen and Maenpaa showed that the mix of these codes describes a texture well. The codes only depend on which neighbors are brighter, so the brightness and the contrast of the image do not change them. The filter shows the codes as a gray image, or counts them in a histogram table for the Features panel. It runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. The input has vertical stripes at the top left, fine noise at the top right, coarse blurred noise at the bottom left and a flat gray at the bottom right. The default and uniform codes keep the stripes as clean vertical bands, turn the coarse noise into large patches, and fill the fine noise and the flat gray alike with speckle. The variance is bright on the stripes and the fine noise and dark on the coarse noise and the flat gray.](../../assets/figures/lbp-light.svg#only-light){ width="480" }
  ![Four panels. The input has vertical stripes at the top left, fine noise at the top right, coarse blurred noise at the bottom left and a flat gray at the bottom right. The default and uniform codes keep the stripes as clean vertical bands, turn the coarse noise into large patches, and fill the fine noise and the flat gray alike with speckle. The variance is bright on the stripes and the fine noise and dark on the coarse noise and the flat gray.](../../assets/figures/lbp-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with four textures: stripes, fine noise, coarse noise and a flat gray with faint noise. Then the codes with 8 points at radius 1, by the default and the uniform method, and the variance method.</figcaption>
</figure>

## How it works

--8<-- "filters/lbp-steps.md"

## Mathematical foundation

--8<-- "filters/lbp-formula.md"

The sign function s throws away how much brighter a neighbor is. Only the order of the gray levels counts. Any change of the image that keeps this order, such as adding a constant or stretching the contrast, keeps the codes.

With P points there are 2^P codes. A quarter turn of the texture turns the bits of the code around the circle. The rotation invariant method turns every code to the smallest number among its rotations, so turned textures give the same code. Uniform codes have at most two changes between 0 and 1 around the circle, such as 00011100. They stand for spots, flat areas, line ends, edges and corners. The uniform method labels them by the number of 1s, from 0 to P, and gives all other codes the label P + 1. The method without rotation invariance, nri_uniform, keeps the turned uniform codes apart.

The variance method is not a code. It gives the variance of the P samples, a measure of the local contrast that the codes leave out. Ojala and coworkers use it together with the codes.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings: the sample points on the circle and the code with the chosen method.

## Parameters

--8<-- "filters/lbp-params.md"

## Implementation

`lbp` in `engine/src/pixelnexus_engine/filters/texture.py` calls `skimage.feature.local_binary_pattern` on the 8-bit luma. Here scikit-image places point p at the angle 2 pi p / P, counterclockwise from the right. It interpolates points between pixels bilinearly and counts points past the edge as 0. For the image output, the codes are scaled so the largest possible code is white. That code is 2^P - 1 for the default and rotation invariant methods, P + 1 for uniform, and P (P - 1) + 2 for nri_uniform. The variance is stretched so its largest value is white. The histogram table has a row for every possible code, with its count and its share of the pixels.

## Worked example

--8<-- "examples/lbp.md"

The stripes use only 12 of the 256 codes, since every column repeats. The fine noise uses almost all of them. The flat quarter, with noise of sigma 2 only, uses 247 codes, about as many as the fine noise. The codes cannot tell faint noise from strong noise. Local Ternary Pattern fixes this with a threshold.

## Complexity

--8<-- "filters/lbp-complexity.md"

## Artifacts and limitations

--8<-- "filters/lbp-limits.md"

## Tests

For every method but the variance, the image must be the code of scikit-image, scaled by the code count, with the alpha kept. The code counts must be right for each method. The histogram must count every pixel. The variance must be stretched to white. Doubling the contrast and adding a constant must keep the codes inside the image. The engine API test runs the filter.

--8<-- "filters/lbp-tests.md"

## References

--8<-- "filters/lbp-references.md"
