# GLCM features

--8<-- "filters/glcm-facts.md"

## Overview

The gray-level co-occurrence matrix counts pairs of pixels at a fixed offset, such as one pixel to the right. It tells how often each gray level has each other level as its partner. Haralick, Shanmugam and Dinstein turned this matrix into texture measures, such as contrast, homogeneity, energy and correlation. Smooth areas put most counts on the diagonal of the matrix, where both levels are the same. Rough areas spread them away from it. The filter gives a table of all measures for the whole image in the Features panel. Or it maps one measure in a window around every pixel. It runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. The input has vertical stripes at the top left, fine noise at the top right, coarse blurred noise at the bottom left and a flat gray at the bottom right. The contrast map is brightest on the fine noise, medium on the stripes and dark elsewhere. The homogeneity map is the reverse, white on the flat gray and light on the coarse noise. The correlation map is white on the flat gray, light on the coarse noise and the stripes, and dark on the fine noise. The borders between the quarters are soft.](../../assets/figures/glcm-light.svg#only-light){ width="480" }
  ![Four panels. The input has vertical stripes at the top left, fine noise at the top right, coarse blurred noise at the bottom left and a flat gray at the bottom right. The contrast map is brightest on the fine noise, medium on the stripes and dark elsewhere. The homogeneity map is the reverse, white on the flat gray and light on the coarse noise. The correlation map is white on the flat gray, light on the coarse noise and the stripes, and dark on the fine noise. The borders between the quarters are soft.](../../assets/figures/glcm-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with four textures: stripes, fine noise, coarse noise and a flat gray with faint noise. Then the maps of contrast, homogeneity and correlation with the defaults, each stretched to the full gray range.</figcaption>
</figure>

## How it works

--8<-- "filters/glcm-steps.md"

## Mathematical foundation

--8<-- "filters/glcm-formula.md"

The matrix has one row and one column for each gray level, so the luma is first quantized to a few levels. With 8 levels, each level covers 32 gray values, and the matrix has 64 entries. A window of 15 x 15 pixels has 210 pairs at distance 1 to fill them.

The offset has a distance and a direction. Texture with a direction gives different matrices at different angles. Vertical stripes change from pixel to pixel along a row, but not along a column, so their contrast is high at 0 degrees and 0 at 90 degrees. Symmetric counting adds each pair in both orders. Then the matrix equals its transpose, and the angles 0 and 180 degrees give the same values.

The other measures, in the form of scikit-image's graycoprops:

* Dissimilarity: the sum of P (i, j) times the absolute difference of i and j.
* Homogeneity: the sum of P (i, j) / (1 + (i - j)^2), high where neighbors have the same level.
* The angular second moment, ASM: the sum of P (i, j)^2, high where a few pairs dominate. Energy is its square root.
* Correlation: the sum of P (i, j) (i - mu_i) (j - mu_j) / (sigma_i sigma_j). Here mu and sigma are the means and standard deviations of the rows and columns of P. Then scikit-image gives 1 where sigma is 0, as in a flat area.
* Entropy: minus the sum of P (i, j) ln P (i, j), high where many pairs are equally common.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings. They are the quantization, the matrix with its offset in x and y, and the properties of the table or the map.

## Parameters

--8<-- "filters/glcm-params.md"

## Implementation

`glcm` in `engine/src/pixelnexus_engine/filters/texture.py` quantizes the 8-bit luma to q = floor(levels Y / 256). Angles count counterclockwise from the x axis, so 90 degrees pairs a pixel with the one above it. Here scikit-image's graycomatrix counts its angles the other way, so it gets the negated angle.

The table calls graycomatrix and graycoprops for the angles 0, 45, 90 and 135 degrees, at distance 1 and at the chosen distance. At 45 degrees, the offset is the distance times the cosine and sine, rounded, so distance 1 reaches the diagonal neighbor.

The map computes the matrix of the window around every pixel at once. For each pair of levels i and j, it marks the pixels of level i whose partner has level j. A window sum on an integral image then counts the marks, so its cost does not depend on the window size. Only pairs with both pixels in the window count, which is what graycomatrix counts on the window cut out. Each window therefore gives the same values as scikit-image. Windows are cut at the image edge. The map is stretched from its smallest to its largest value.

## Worked example

--8<-- "examples/glcm.md"

The stripes have contrast at 0 degrees and none at 90 degrees, since they are vertical. The noise quarters give about the same values at both angles. The fine noise has the highest contrast and almost no correlation, since neighbors are independent. The coarse noise has high homogeneity and correlation, since neighbors are alike. The flat quarter stays inside one level, so its matrix has a single entry: no contrast, and energy and homogeneity of 1.

## Complexity

--8<-- "filters/glcm-complexity.md"

## Artifacts and limitations

--8<-- "filters/glcm-limits.md"

## Tests

The offsets must count counterclockwise with y down. Each table row must equal graycoprops of a matrix counted pair by pair with our offsets, with and without symmetry. Distance 1 must be listed once. For every property, the map at sample pixels, the corners included, must equal graycoprops of the window cut out. The map must be stretched to the full range, and a flat image must give a black map. On the Siemens star, the mean contrast in rings around the center must fall from the center outward. The engine API test checks the JSON table.

--8<-- "filters/glcm-tests.md"

## References

--8<-- "filters/glcm-references.md"
