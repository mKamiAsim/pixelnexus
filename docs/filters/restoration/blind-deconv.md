# Blind deconvolution

--8<-- "filters/blind-deconv-facts.md"

## Overview

Blind deconvolution estimates both the sharp image and the blur from one photo. It alternates Richardson-Lucy steps: a few for the blur with the image held still, then a few for the image with the blur held still. This filter is experimental. The pair of image and blur is not unique, and the result depends strongly on the first guess. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: a blurred Siemens star; the blind result, with sharper spokes and a little ringing at the rim; the PSF found, a soft bright blob; and the true PSF, a slightly smaller blob.](../../assets/figures/blind-deconv-light.svg#only-light){ width="480" }
  ![Four panels: a blurred Siemens star; the blind result, with sharper spokes and a little ringing at the rim; the PSF found, a soft bright blob; and the true PSF, a slightly smaller blob.](../../assets/figures/blind-deconv-dark.svg#only-dark){ width="480" }
  <figcaption>A Siemens star blurred with a Gaussian of sigma 2, the result of blind deconvolution with the defaults, the PSF it found, and the true PSF. The PSF found is a little wider than the true one.</figcaption>
</figure>

## How it works

1. Extend each channel with the border mode, as the frequency filters do.
2. Start with the photo as the image and a Gaussian of the chosen sigma as the blur, cut to the support square.
3. Run a few Richardson-Lucy steps for the blur, with the image fixed. After each one, keep the support, set negative weights to 0 and scale the sum to 1.
4. Run a few Richardson-Lucy steps for the image, with the blur fixed.
5. Repeat for the chosen number of cycles, then crop the image, or show the blur.

## Mathematical foundation

--8<-- "filters/blind-deconv-formula.md"

A blurred photo is the convolution of the sharp image with the blur. Convolution is symmetric, so the Richardson-Lucy step that sharpens the image for a known blur can also refine the blur for a known image. Fish, Brinicombe, Pike and Walker alternated the two. The trouble is that the problem has too many answers. A single bright point as the blur, with the photo itself as the image, fits the data perfectly. Constraints push the search away from such answers. Here the blur must lie inside a small square, have no negative weights and sum to 1. A wide first guess also helps, since a narrow guess tends to stay narrow. The worked example shows both effects.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the start, the PSF steps, the image steps and the number of cycles.

## Algorithm

--8<-- "filters/blind-deconv-steps.md"

## Parameters

--8<-- "filters/blind-deconv-params.md"

## Implementation

`blind_deconv` in `engine/src/pixelnexus_engine/filters/restoration.py` runs `blind_deconv_plane` on each channel the scope names. `blind_rl` alternates `psf_step` and `image_step`. Both work on the extended grid through the FFT. `psf_picture` draws the PSF for the Show PSF output. With the brightness scope, one PSF is found for the luma. With the RGB scope, each channel gets its own. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/blind-deconv.md"

## Complexity

--8<-- "filters/blind-deconv-complexity.md"

## Artifacts and limitations

--8<-- "filters/blind-deconv-limits.md"

## Tests

Without noise, the sharp image and the true PSF must be fixed points of both steps. The image step must equal a Richardson-Lucy step written in the test. From a first guess of sigma 3, 40 cycles must bring the PSF at least 30 percent closer to the true PSF of sigma 1.5. The PSF must stay inside its support, non-negative and summing to 1. Show PSF must draw the kernel in the middle with its largest weight at 255. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/blind-deconv-tests.md"

## References

--8<-- "filters/blind-deconv-references.md"
