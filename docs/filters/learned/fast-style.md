# Neural style and texture filters

--8<-- "filters/fast-style-facts.md"

## Overview

Fast neural style transfer, after Johnson, Alahi and Fei-Fei, repaints an image in the style of a painting in one pass. Each network was trained once, for one painting, to keep the content of any photo while matching the textures and colors of the painting. PixelNexus offers the five models of the ONNX model zoo. Each is a separate download. The filter runs in the PixelNexus engine.

It needs an optional model. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. Models published as PyTorch weights are converted to ONNX once on your computer with `tools/export_models.py`. The engine itself never uses PyTorch. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Four panels showing the red channel. The input is a dark and a light half with a faint checked texture. Mosaic turns it into bold dark outlines and curved strokes around the halves. Candy makes it bright with soft rounded shapes. Udnie gives darker tones with broad soft strokes.](../../assets/figures/fast-style-light.svg#only-light){ width="480" }
  ![Four panels showing the red channel. The input is a dark and a light half with a faint checked texture. Mosaic turns it into bold dark outlines and curved strokes around the halves. Candy makes it bright with soft rounded shapes. Udnie gives darker tones with broad soft strokes.](../../assets/figures/fast-style-dark.svg#only-dark){ width="480" }
  <figcaption>A dark and a bright half with a fine texture, then styled as mosaic, candy and udnie at full strength. The figure shows the red channel.</figcaption>
</figure>

## How it works

--8<-- "filters/fast-style-steps.md"

## Mathematical foundation

--8<-- "filters/fast-style-formula.md"

During training, a fixed VGG network measured two things. The content loss compared the deep features of the output with those of the photo. The style loss compared their correlations, the Gram matrices, with those of the painting. The style network learned to make both small. After training, no VGG is needed. One pass of the style network is enough.

## Kernel or operator

A trained network has many learned kernels, not one. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/fast-style-params.md"

## Implementation

`fast_style` in `engine/src/pixelnexus_engine/filters/learned.py` runs the zoo model of the chosen style. The models declare a fixed 224 x 224 input, although the network is fully convolutional. The engine frees the height and width in memory with the onnx package, and leaves the downloaded file unchanged. The output is rounded up to a multiple of 4 and cropped to the image. Strength mixes the result with the input, our choice.

## Worked example

Style transfer has no ground truth, so there is no score. The figure shows three styles on one test image. Brush strokes have a fixed size in pixels, so a large image gets relatively finer strokes than a small one.

## Complexity

--8<-- "filters/fast-style-complexity.md"

## Artifacts and limitations

--8<-- "filters/fast-style-limits.md"

## Tests

Tiny ONNX models made inside the tests check the plumbing in every test run. Tiles with enough margin must equal a run on the whole image. Color, alpha and padding must be handled as described. Where the real model is downloaded, as on the development machine, the real network is checked too. A model with a fixed 224 x 224 input must run at another size, and the strength must mix the result with the input.

--8<-- "filters/fast-style-tests.md"

## References

--8<-- "filters/fast-style-references.md"
