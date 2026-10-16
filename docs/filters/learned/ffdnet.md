# FFDNet

--8<-- "filters/ffdnet-facts.md"

## Overview

FFDNet, by Zhang, Zuo and Zhang, is a denoising network that you tell how strong the noise is. The noise level enters as an extra input channel, so one model covers weak and strong noise, and you can trade detail against smoothness. It works on four half-size copies of the image, which makes it fast. The filter runs in the PixelNexus engine.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. Models published as PyTorch weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Four panels showing the red channel. The noisy input is the step and three lines under heavy grain. With the noise level set to 5, most of the grain stays. With 25, the grain is gone and the edge and lines are sharp. With 50, the image is smooth but a stretch of one thin line has faded.](../../assets/figures/ffdnet-light.svg#only-light){ width="480" }
  ![Four panels showing the red channel. The noisy input is the step and three lines under heavy grain. With the noise level set to 5, most of the grain stays. With 25, the grain is gone and the edge and lines are sharp. With 50, the image is smooth but a stretch of one thin line has faded.](../../assets/figures/ffdnet-dark.svg#only-dark){ width="480" }
  <figcaption>The image of the DnCNN figure with noise of sigma 25 in each channel. Then FFDNet with the noise level set to 5, 25 and 50. The figure shows the red channel.</figcaption>
</figure>

## How it works

--8<-- "filters/ffdnet-steps.md"

## Mathematical foundation

--8<-- "filters/ffdnet-formula.md"

Splitting the image into four subimages halves the width and height, so the 12 convolutions see a larger area for the same cost. The noise level map tells the network how much to remove. A level below the true noise leaves noise. A level above it removes detail too.

## Kernel or operator

A trained network has many learned kernels, not one. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/ffdnet-params.md"

## Implementation

`ffdnet` in `engine/src/pixelnexus_engine/filters/learned.py` runs the ONNX file that `tools/export_models.py` made from KAIR's color weights, with 96 channels and 12 layers as in KAIR's test script. FFDNet's own code works out its edge padding with NumPy, so the export keeps the padding of its example size. The engine therefore pads the image to even sides by repeating the edge, as FFDNet itself does, and crops the result back. Tiles of 512 pixels start at even offsets with 32 pixels of margin.

## Worked example

--8<-- "examples/ffdnet.md"

The best result comes with the level set to the true noise, 25. Set lower, noise stays. Set higher, detail goes, and at 50 a stretch of a thin line fades, as the figure shows.

## Complexity

--8<-- "filters/ffdnet-complexity.md"

## Artifacts and limitations

--8<-- "filters/ffdnet-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. Tiles with enough margin must equal a run on the whole image. Color, alpha and padding must be handled as described. Where the real model is downloaded, as on the development machine, the real network is checked too. The noise level must reach the network, and odd sides must be padded and cropped back. On a noisy scene the real FFDNet must do better with the right level than with a level far too low.

--8<-- "filters/ffdnet-tests.md"

## References

--8<-- "filters/ffdnet-references.md"
