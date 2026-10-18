# DnCNN

--8<-- "filters/dncnn-facts.md"

## Overview

DnCNN, by Zhang and colleagues, removes noise with a network of 20 convolutions. It does not learn the clean image. It learns the noise, which is simpler, and subtracts it. The color model is blind, so you set no noise level. A second model, DnCNN-3, was trained for noise, blur and JPEG blocking together. PixelNexus uses it on the brightness to clean JPEG artifacts. The filter runs in the PixelNexus engine.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. Models published as PyTorch weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Four panels showing the red channel. The noisy input has a dark area and a light area split by a diagonal edge, crossed by three thin bright lines, all under heavy grain. DnCNN, FFDNet and BM3D-lite each remove the grain and keep the edge and the lines sharp. BM3D-lite leaves faint blotches in the flat areas.](../../assets/figures/dncnn-light.svg#only-light){ width="480" }
  ![Four panels showing the red channel. The noisy input has a dark area and a light area split by a diagonal edge, crossed by three thin bright lines, all under heavy grain. DnCNN, FFDNet and BM3D-lite each remove the grain and keep the edge and the lines sharp. BM3D-lite leaves faint blotches in the flat areas.](../../assets/figures/dncnn-dark.svg#only-dark){ width="480" }
  <figcaption>A step and three thin lines with noise of sigma 25 in each color channel. Then DnCNN, FFDNet with the noise level set to 25, and BM3D-lite with sigma 25. The figure shows the red channel.</figcaption>
</figure>

## How it works

--8<-- "filters/dncnn-steps.md"

## Mathematical foundation

--8<-- "filters/dncnn-formula.md"

Residual learning makes the task easier: for small noise, the residual is close to a Gaussian with a fixed spread, whatever the image. Batch normalization stabilized training. In the released weights, KAIR merged it into the convolutions, so inference is plain convolution and ReLU.

## Kernel or operator

A trained network has many learned kernels, not one. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/dncnn-params.md"

## Implementation

`dncnn` in `engine/src/pixelnexus_engine/filters/learned.py` runs the ONNX file that `tools/export_models.py` made from KAIR's weights. The export imports KAIR's own network code at a pinned commit, with the settings of KAIR's test script: 20 layers, batch normalization merged. It keeps the file only when ONNX Runtime matches PyTorch, here to within 2e-6. Images run in tiles of 512 pixels with 24 pixels of margin, wider than the 20 pixel reach of the network, so tiles equal a run on the whole image. For JPEG cleanup, DnCNN-3 runs on Y of full-range Y'CbCr with the BT.709 weights, and Cb and Cr stay, our choice for color images.

## Worked example

--8<-- "examples/dncnn.md"

With independent noise in each channel, both networks gain 14 to 15 dB at sigma 25 and beat BM3D-lite. Noise that is the same in all channels is another matter, as in a gray image saved as RGB. DnCNN then changes almost nothing, 0.2 dB, and FFDNet gains only 3.5 dB. Both color models were trained on noise that differs between channels, so noise without color looks like detail to them. For gray images, BM3D-lite or a gray model is the better choice. DnCNN-3 gains 1.5 to 2.7 dB on JPEG blocking.

## Complexity

--8<-- "filters/dncnn-complexity.md"

## Artifacts and limitations

--8<-- "filters/dncnn-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. Tiles with enough margin must equal a run on the whole image. Color, alpha and padding must be handled as described. Where the real model is downloaded, as on the development machine, the real network is checked too. On a noisy color scene the real DnCNN must gain more than 6 dB, and its tiles must equal a run on the whole image.

--8<-- "filters/dncnn-tests.md"

## References

--8<-- "filters/dncnn-references.md"
