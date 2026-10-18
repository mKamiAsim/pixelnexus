# Restormer

--8<-- "filters/restormer-facts.md"

## Overview

Restormer, by Zamir and colleagues, restores photos with a network of transformer blocks. PixelNexus offers two of its models. One removes the noise of real cameras, trained on smartphone photos. The other removes motion blur, trained on frames of handheld video. The filter runs in the PixelNexus engine.

It needs an optional model. Each model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. The weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Three panels: a step and three thin lines, the same blurred along the rows, and Restormer's result. The slanted step edge is sharp again. The thin lines stay smeared, and the steep line shows a ladder-like texture.](../../assets/figures/restormer-light.svg#only-light){ width="480" }
  ![Three panels: a step and three thin lines, the same blurred along the rows, and Restormer's result. The slanted step edge is sharp again. The thin lines stay smeared, and the steep line shows a ladder-like texture.](../../assets/figures/restormer-dark.svg#only-dark){ width="480" }
  <figcaption>A horizontal motion blur of 9 pixels, then Restormer with its motion blur model.</figcaption>
</figure>

## How it works

--8<-- "filters/restormer-steps.md"

## Mathematical foundation

--8<-- "filters/restormer-formula.md"

Attention between pixels compares every pixel with every other one, so its cost grows with the square of the number of pixels. That is too much for a photo. Restormer turns the attention around. It compares the feature channels with each other, each summed over all pixels. That matrix has one row and one column per channel, whatever the image size. So the attention sees the whole image and still costs time in proportion to its size. Depthwise 3 x 3 convolutions before the attention bring in the neighbors of each pixel.

## Kernel or operator

A trained network has many learned weights, not one kernel. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/restormer-params.md"

## Implementation

`restormer` in `engine/src/pixelnexus_engine/filters/learned.py` runs an ONNX file. `tools/export_models.py` made it from the official weights, with the settings of the option files of the Restormer repository. Like the repository's `demo.py`, it mirrors the image at the bottom and right to sides that are multiples of 8. Images up to 720 pixels on each side run whole. Larger ones run in tiles of 720 pixels, and where tiles overlap, their results are averaged. The attention spans the whole input, so tiles are close to a whole run, not equal.

## Worked example

--8<-- "examples/restormer.md"

The real noise model gains only 1.3 to 5 dB on this synthetic noise, far less than DnCNN. Real camera noise differs from it: neighbors share part of it, and it grows with the brightness. A model learns the noise it was trained on. The motion blur model sharpens the step, and gains 0.9 to 1.5 dB there. On the texture image it gains nothing, since stripes and fine noise lost to the blur cannot be told apart from plausible new ones.

## Complexity

--8<-- "filters/restormer-complexity.md"

## Artifacts and limitations

--8<-- "filters/restormer-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. One refuses sides that are not multiples of 8, so the test proves the padding, and the crop back to the image size. Another checks that overlapping tiles are averaged and that the result is clamped. Where the real models are downloaded, the noise model must raise the PSNR of a noisy image by more than 6 dB. The blur model must raise the PSNR of an image with a horizontal motion blur.

--8<-- "filters/restormer-tests.md"

## References

--8<-- "filters/restormer-references.md"
