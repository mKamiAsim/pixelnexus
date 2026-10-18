# SRCNN and FSRCNN

--8<-- "filters/srcnn-facts.md"

## Overview

SRCNN, by Dong and colleagues, was the first convolutional network for super-resolution. It ran three layers after a bicubic enlargement. FSRCNN, by the same authors, made it faster by working at the small size and enlarging only at the end with a transposed convolution. PixelNexus runs FSRCNN at two times, since SRCNN itself has no published weights with a clear license. The model is under 0.1 MB, small enough to study. OpenCV's dnn_superres module runs it.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. Models published as PyTorch weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Three panels with four quarters each: stripes, fine noise, soft blobs and flat gray. Bicubic and FSRCNN both look slightly soft and close to the original at this scale.](../../assets/figures/srcnn-light.svg#only-light){ width="480" }
  ![Three panels with four quarters each: stripes, fine noise, soft blobs and flat gray. Bicubic and FSRCNN both look slightly soft and close to the original at this scale.](../../assets/figures/srcnn-dark.svg#only-dark){ width="480" }
  <figcaption>The texture image of the edge pages. Shrunk two times with bicubic, then enlarged two times with bicubic and FSRCNN.</figcaption>
</figure>

## How it works

--8<-- "filters/srcnn-steps.md"

## Mathematical foundation

--8<-- "filters/srcnn-formula.md"

FSRCNN extracts features with a 5 x 5 convolution and shrinks them to fewer channels. A few 3 x 3 layers map them, and a transposed convolution enlarges the result. Working at the small size makes it much faster than SRCNN.

## Kernel or operator

A trained network has many learned kernels, not one. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/srcnn-params.md"

## Implementation

`srcnn` in `engine/src/pixelnexus_engine/filters/learned.py` calls `cv2.dnn_superres.DnnSuperResImpl` with the FSRCNN x2 model of the FSRCNN_Tensorflow project. Colors are premultiplied by alpha first, and alpha is enlarged with bicubic.

## Worked example

--8<-- "examples/srcnn.md"

FSRCNN does not beat bicubic on this image. It is 0.1 dB lower on the whole image and 1.6 dB lower on the stripes. The model was trained on a different shrinking than the one used here, and it is tiny. It is in PixelNexus to show how a small network enlarges, not to beat the classical methods.

## Complexity

--8<-- "filters/srcnn-complexity.md"

## Artifacts and limitations

--8<-- "filters/srcnn-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. Tiles with enough margin must equal a run on the whole image. Color, alpha and padding must be handled as described. Where the real model is downloaded, as on the development machine, the real network is checked too. With the real model, the result must be two times larger.

--8<-- "filters/srcnn-tests.md"

## References

--8<-- "filters/srcnn-references.md"
