# Real-ESRGAN

--8<-- "filters/real-esrgan-facts.md"

## Overview

Real-ESRGAN, by Wang and colleagues, enlarges an image four times. It was trained on photos degraded on purpose by blur, noise, resizing and JPEG compression together, so it copes with real photos. Its training used a GAN, which rewards detail that looks real rather than detail that is exact. So it invents plausible texture. PixelNexus uses its compact general model. The filter runs in the PixelNexus engine.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. Models published as PyTorch weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Four panels in four quarters each: stripes, fine noise, soft blobs and flat gray. The original is sharp. Bicubic is soft, with the stripes blurred and the noise smoothed away. Real-ESRGAN gives crisp stripes but turns the soft blobs into a busy, painted texture that was not there. EDSR is close to bicubic, a little sharper.](../../assets/figures/real-esrgan-light.svg#only-light){ width="480" }
  ![Four panels in four quarters each: stripes, fine noise, soft blobs and flat gray. The original is sharp. Bicubic is soft, with the stripes blurred and the noise smoothed away. Real-ESRGAN gives crisp stripes but turns the soft blobs into a busy, painted texture that was not there. EDSR is close to bicubic, a little sharper.](../../assets/figures/real-esrgan-dark.svg#only-dark){ width="480" }
  <figcaption>The texture image of the edge pages: stripes, fine noise, soft blobs and a flat gray. Shrunk four times with bicubic, then enlarged four times with bicubic, Real-ESRGAN and EDSR.</figcaption>
</figure>

## How it works

--8<-- "filters/real-esrgan-steps.md"

## Mathematical foundation

--8<-- "filters/real-esrgan-formula.md"

The compact network works at the small size and enlarges only in its last layer, where a pixel shuffle turns 48 channels into a four times larger picture. The nearest-neighbor enlargement of the input is added, so the network learns only the missing detail.

## Kernel or operator

A trained network has many learned kernels, not one. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/real-esrgan-params.md"

## Implementation

`real_esrgan` in `engine/src/pixelnexus_engine/filters/learned.py` runs the ONNX file that `tools/export_models.py` made from the official weights, with the 32 body convolutions of the general model. Colors are premultiplied by alpha first, as Resize does, and alpha is enlarged with bicubic. Images run in tiles of 256 pixels with 40 pixels of margin, wider than the reach of the 34 convolutions.

## Worked example

--8<-- "examples/real-esrgan.md"

Real-ESRGAN scores below bicubic on this image, 18.3 dB against 20.3, although its stripes look crisper. On the soft blobs it loses 10 dB, since it paints texture that was not there. PSNR rewards caution, while Real-ESRGAN aims at a convincing look. Never use it where the detail must be true.

## Complexity

--8<-- "filters/real-esrgan-complexity.md"

## Artifacts and limitations

--8<-- "filters/real-esrgan-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. Tiles with enough margin must equal a run on the whole image. Color, alpha and padding must be handled as described. Where the real model is downloaded, as on the development machine, the real network is checked too. The result must be four times larger, with alpha enlarged too.

--8<-- "filters/real-esrgan-tests.md"

## References

--8<-- "filters/real-esrgan-references.md"
