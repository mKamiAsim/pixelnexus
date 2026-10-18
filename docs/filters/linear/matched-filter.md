# Matched filter

--8<-- "filters/matched-filter-facts.md"

## Overview

Select a pattern, and the matched filter searches the whole image for it. It slides the template over every position and compares it with the image under it. The plain matched filter multiplies and adds, which is a correlation. The normalized cross-correlation also divides by the spread of the window and of the template. It then scores how alike the shapes are, from -1 to 1, whatever their brightness and contrast. The filter shows either map, or lists the best matches in the Features panel and draws them on the canvas. It runs in the PixelNexus engine, with scikit-image and SciPy.

The selection is only the template here. The filter runs on the whole image, and the result covers the whole image.

<figure markdown="span">
  ![Four panels. The input has a bright cross on a dark square at the top left, marked with a box as the selection. There is a faint gray cross at the top right, a dark cross on a light square on the left, a bright white block in the middle and a full copy of the first cross at the bottom right, all with grainy noise. The normalized map has a bright spot at the template, the faint copy and the full copy, a dark spot at the inverted copy, and a light frame around the block. The plain map has bright spots at the template and the full copy, only a faint spot at the faint copy, and a light frame around the block. The matches panel draws rings around the template, the faint copy and the full copy.](../../assets/figures/matched-filter-light.svg#only-light){ width="480" }
  ![Four panels. The input has a bright cross on a dark square at the top left, marked with a box as the selection. There is a faint gray cross at the top right, a dark cross on a light square on the left, a bright white block in the middle and a full copy of the first cross at the bottom right, all with grainy noise. The normalized map has a bright spot at the template, the faint copy and the full copy, a dark spot at the inverted copy, and a light frame around the block. The plain map has bright spots at the template and the full copy, only a faint spot at the faint copy, and a light frame around the block. The matches panel draws rings around the template, the faint copy and the full copy.](../../assets/figures/matched-filter-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with a cross, a faint copy, an inverted copy, a bright block and a full copy, with noise of sigma 8. The selection is the square around the first cross. Then the normalized cross-correlation and the plain matched filter. Last, the matches with the defaults, each drawn as a ring.</figcaption>
</figure>

## How it works

--8<-- "filters/matched-filter-steps.md"

## Mathematical foundation

--8<-- "filters/matched-filter-formula.md"

The matched filter comes from signal processing. To find a known signal in white noise, correlate with the signal itself. Turin showed that this gives the best ratio of signal to noise at the place of the signal. In an image, the signal is the template, and the correlation is computed at every position.

The plain correlation has a weakness. It grows with the contrast of the window. A copy of the pattern at a quarter of the contrast scores a quarter as much. Strong edges that only partly look like the pattern can score more than a real but faint copy. Subtracting the template's mean keeps flat areas at 0, but it does not fix this.

The normalized cross-correlation removes the mean of each window and divides by the spread of the window and of the template. By the Cauchy-Schwarz inequality, the result lies between -1 and 1. It is 1 exactly when the window equals the template times a positive number plus a constant, so brightness and contrast drop out. It is -1 for the template with dark and light swapped.

Computed directly, each position needs a sum over the whole template. Lewis showed how to make it fast. The numerator is a correlation, which the FFT computes for all positions at once. The sums of the window and of its squares come from integral images.

## Kernel or operator

The kernel is the template itself, less its mean, cut from the image. The Inspector asks the engine for the stages with the current settings: the template, the plain matched filter, the normalization and the matches.

## Parameters

--8<-- "filters/matched-filter-params.md"

## Implementation

`matched_filter` in `engine/src/pixelnexus_engine/filters/matched.py` cuts the template from the luma in pixel levels, inside the rectangle around the selected pixels. A flat template, or an empty selection, stops the job with a message.

The normalized map is `skimage.feature.match_template` with `pad_input`. It pads the image by the template size with the border mode, computes the numerator with `scipy.signal.fftconvolve` and the window sums with integral images. A window with no spread gives 0. For a template of h x w pixels, the value of the window with its top-left pixel at (top, left) lands on pixel (top + h // 2, left + w // 2). The map shows -1 as black, 0 as mid gray and 1 as white.

The plain map is the correlation with the template less its mean, padded and aligned the same way. It is shown with 0 as mid gray, and stretched so its largest absolute value is black or white.

The matches are the peaks of the normalized map found by `skimage.feature.peak_local_max`, at or above the threshold. They lie at least half the smaller side of the template apart, which is our choice, and at most the given number are kept. Each row gives the center of the matching window, the score, and the size of the template. It also gives a radius of half the smaller side of the template, so the canvas draws a ring that fits.

## Worked example

--8<-- "examples/matched-filter.md"

The normalized map gives the faint copy the same score as the template. The plain map gives it a quarter, less than the edge of the bright block. Noise of sigma 8 lowers the faint copy to 0.92 and leaves the strong copies near 1. The inverted copy scores -1 in both maps, so it is never a match.

## Complexity

--8<-- "filters/matched-filter-complexity.md"

## Artifacts and limitations

--8<-- "filters/matched-filter-limits.md"

## Tests

The template must be the rectangle around the selected pixels, and an empty or flat template must stop with a message. The normalized map must equal scikit-image's match_template for two border modes. A template must score 1 at its own center, for odd and even sizes. The plain map must equal a direct sum over the padded window at sample pixels. On the test scene, the faint and the full copy must score 1, the inverted copy -1 and the inside of the block 0. The plain map must score the faint copy at a quarter, below a corner of the block. The matches must be the three copies, with centers between pixels for an even template. With noise and a threshold of 0.95, the faint copy must drop out first. The engine API tests send the template as a mask, and refuse a job without one.

--8<-- "filters/matched-filter-tests.md"

## References

--8<-- "filters/matched-filter-references.md"
