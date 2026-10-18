# SwinIR super-resolution

--8<-- "filters/swinir-sr-facts.md"

## Overview

This filter enlarges an image two times with the lightweight SwinIR model of Liang and colleagues. It was trained on clean images that were shrunk with bicubic, so it rebuilds the detail that bicubic shrinking removed. It cannot undo blur, noise or JPEG artifacts, which Real-ESRGAN was trained for. The filter runs in the PixelNexus engine.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. The weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Four panels in four quarters each: stripes, fine noise, soft blobs and flat gray. The original, then bicubic, FSRCNN and SwinIR after shrinking two times. All keep the stripes. In the noise quarter, FSRCNN and SwinIR draw a wormy texture that the original does not have.](../../assets/figures/swinir-sr-light.svg#only-light){ width="480" }
  ![Four panels in four quarters each: stripes, fine noise, soft blobs and flat gray. The original, then bicubic, FSRCNN and SwinIR after shrinking two times. All keep the stripes. In the noise quarter, FSRCNN and SwinIR draw a wormy texture that the original does not have.](../../assets/figures/swinir-sr-dark.svg#only-dark){ width="480" }
  <figcaption>The texture image, shrunk two times with bicubic, then enlarged two times with bicubic, FSRCNN and SwinIR.</figcaption>
</figure>

## How it works

--8<-- "filters/swinir-sr-steps.md"

## Mathematical foundation

--8<-- "filters/swinir-sr-formula.md"

The network works at the small size. Only its last layer enlarges: a convolution makes 12 channels, and the pixel shuffle moves each group of 4 channels into a block of 2 x 2 pixels. The attention of the Swin Transformer blocks is the same as in the [SwinIR denoiser](swinir.md).

## Kernel or operator

A trained network has many learned weights, not one kernel. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/swinir-sr-params.md"

## Implementation

`swinir_sr` in `engine/src/pixelnexus_engine/filters/learned.py` runs an ONNX file. `tools/export_models.py` made it from the official weights. The settings are those of SwinIR's own test script. The export is fixed to tiles of 128 x 128 pixels. `fixed_tiles` mirrors the image past its edges. It cuts the image into tiles that overlap by 32 pixels on each side and keeps the center of each, now two times larger. Colors are premultiplied by alpha first, as Resize does, and alpha is enlarged with bicubic.

## Worked example

--8<-- "examples/swinir-sr.md"

On this image SwinIR scores the same as bicubic, within 0.1 dB. The fine noise and the stripes are lost in the small copy, so no method can bring them back, and SwinIR draws plausible texture in their place. On smooth images that were shrunk with bicubic, the tests show SwinIR above bicubic.

## Complexity

--8<-- "filters/swinir-sr-complexity.md"

## Artifacts and limitations

--8<-- "filters/swinir-sr-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run, as for the [SwinIR denoiser](swinir.md). The result must be two times larger, with alpha enlarged too. Where the real model is downloaded, the real network must score above bicubic on an image that was shrunk with bicubic.

--8<-- "filters/swinir-sr-tests.md"

## References

--8<-- "filters/swinir-sr-references.md"
