# EDSR

--8<-- "filters/edsr-facts.md"

## Overview

EDSR, by Lim and colleagues, enlarges an image four times with a deep residual network. It was trained on clean images shrunk with bicubic and an L1 loss, so it aims at the true image and does not invent texture the way GAN models do. OpenCV's dnn_superres module runs it. The filter runs in the PixelNexus engine.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. Models published as PyTorch weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Four panels in four quarters each: stripes, fine noise, soft blobs and flat gray. The original is sharp. Bicubic is soft, with the stripes blurred and the noise smoothed away. Real-ESRGAN gives crisp stripes but turns the soft blobs into a busy, painted texture that was not there. EDSR is close to bicubic, a little sharper.](../../assets/figures/edsr-light.svg#only-light){ width="480" }
  ![Four panels in four quarters each: stripes, fine noise, soft blobs and flat gray. The original is sharp. Bicubic is soft, with the stripes blurred and the noise smoothed away. Real-ESRGAN gives crisp stripes but turns the soft blobs into a busy, painted texture that was not there. EDSR is close to bicubic, a little sharper.](../../assets/figures/edsr-dark.svg#only-dark){ width="480" }
  <figcaption>The texture image of the edge pages: stripes, fine noise, soft blobs and a flat gray. Shrunk four times with bicubic, then enlarged four times with bicubic, Real-ESRGAN and EDSR.</figcaption>
</figure>

## How it works

--8<-- "filters/edsr-steps.md"

## Mathematical foundation

--8<-- "filters/edsr-formula.md"

EDSR removed batch normalization from the residual blocks of earlier networks, which saved memory and improved results, and used that saving for more blocks and channels. An upsampling part with pixel shuffles enlarges the features at the end.

## Kernel or operator

A trained network has many learned kernels, not one. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/edsr-params.md"

## Implementation

`edsr` in `engine/src/pixelnexus_engine/filters/learned.py` calls `cv2.dnn_superres.DnnSuperResImpl` with the EDSR x4 model of the EDSR_Tensorflow project. Colors are premultiplied by alpha first, and alpha is enlarged with bicubic. OpenCV 5 still reads these TensorFlow files.

## Worked example

--8<-- "examples/edsr.md"

EDSR matches bicubic on the whole image and is a little better on the stripes and the blobs. It adds no false texture. The fine noise quarter cannot be recovered by any method, since the shrinking removed it.

## Complexity

--8<-- "filters/edsr-complexity.md"

## Artifacts and limitations

--8<-- "filters/edsr-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. Tiles with enough margin must equal a run on the whole image. Color, alpha and padding must be handled as described. Where the real model is downloaded, as on the development machine, the real network is checked too. With the real model, the result must be four times larger.

--8<-- "filters/edsr-tests.md"

## References

--8<-- "filters/edsr-references.md"
