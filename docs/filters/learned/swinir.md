# SwinIR

--8<-- "filters/swinir-facts.md"

## Overview

SwinIR, by Liang and colleagues, restores images with a network built from Swin Transformer blocks. PixelNexus uses its model for color photos with Gaussian noise of sigma 25. Unlike DnCNN, whose kernels are the same everywhere, SwinIR's attention weighs the pixels of each small window by how alike they are. So it adapts to edges and textures. The filter runs in the PixelNexus engine.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. The weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Three panels: a step and three thin lines with strong noise, then DnCNN and SwinIR. Both remove the noise and keep the step and the lines. The flat areas of SwinIR are the smoother.](../../assets/figures/swinir-light.svg#only-light){ width="480" }
  ![Three panels: a step and three thin lines with strong noise, then DnCNN and SwinIR. Both remove the noise and keep the step and the lines. The flat areas of SwinIR are the smoother.](../../assets/figures/swinir-dark.svg#only-dark){ width="480" }
  <figcaption>Noise of sigma 25 in each color channel, then DnCNN and SwinIR. The red channel.</figcaption>
</figure>

## How it works

--8<-- "filters/swinir-steps.md"

## Mathematical foundation

--8<-- "filters/swinir-formula.md"

Attention compares every pair of pixels in a window. The query of one and the key of the other give a weight. The result is the sum of the values with those weights. Inside a window of 8 x 8 pixels that costs 64 x 64 comparisons, so the cost grows with the number of pixels, not with its square. Shifting the windows by 4 pixels in every second block lets information cross the window borders. After many blocks, each pixel has seen a wide area.

## Kernel or operator

A trained network has many learned weights, not one kernel. The Inspector shows the stages and the model with its license.

## Parameters

This filter has no parameters. The model was trained for one noise level, sigma 25.

## Implementation

`swinir` in `engine/src/pixelnexus_engine/filters/learned.py` runs an ONNX file. `tools/export_models.py` made it from the official weights. The settings are those of SwinIR's own test script. SwinIR builds its attention masks from the input size while it runs, so the export is fixed to tiles of 256 x 256 pixels. `fixed_tiles` mirrors the image past its edges. It cuts the image into tiles that overlap by 32 pixels on each side and keeps the center of each. The shifted windows reach further than 32 pixels, so the result is close to a run on the whole image, not equal.

## Worked example

--8<-- "examples/swinir.md"

At sigma 25, its training level, SwinIR scores about 8 dB above DnCNN on this image, and it also wins at sigma 15. At sigma 50 it fails: the result is barely better than the noisy image, since this model never saw noise that strong. DnCNN is blind, trained for a range of levels, so it copes. Use SwinIR only near the noise it was trained for.

## Complexity

--8<-- "filters/swinir-complexity.md"

## Artifacts and limitations

--8<-- "filters/swinir-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. A model that accepts only one input size proves that every tile has exactly that size. A chain of box filters shows that tiles with enough margin equal a run on the whole image, away from its edges. Color and alpha must be handled as described. Where the real model is downloaded, the real network must raise the PSNR of a noisy image by more than 6 dB.

--8<-- "filters/swinir-tests.md"

## References

--8<-- "filters/swinir-references.md"
