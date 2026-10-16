# Learned edge detector

--8<-- "filters/learned-edges-facts.md"

## Overview

A learned edge detector finds the edges that people draw. HED, by Xie and Tu, and PiDiNet, by Su and colleagues, were both trained on the BSDS500 photos, where people traced the outlines of objects. So they mark the borders of objects and regions, and stay quiet on texture, where gradient detectors such as Canny mark every change. The filter runs in the PixelNexus engine.

Each network needs an optional model. It downloads only when you click **Download model** in the Properties panel, which first shows its size and license, and the engine checks its SHA-256 before it keeps it. HED is a Caffe model, and OpenCV 5 no longer reads Caffe, so `tools/export_models.py` converts it to ONNX once on your computer. PiDiNet is published as PyTorch weights and is converted the same way. PiDiNet's license allows research and non-commercial use only, and the studio says so before the download. Results carry the label: AI result. Detail may not exist in the original scene.

<figure markdown="span">
  ![Four panels. The input has vertical stripes, fine noise, soft blobs and a flat gray in its four quarters. Canny marks every stripe and fills the noise and blob quarters with tangled white lines. HED shows a soft white cross along the borders between the quarters, with faint traces of the stripes and the noise. PiDiNet shows a sharper white cross and almost nothing inside the quarters.](../../assets/figures/learned-edges-light.svg#only-light){ width="480" }
  ![Four panels. The input has vertical stripes, fine noise, soft blobs and a flat gray in its four quarters. Canny marks every stripe and fills the noise and blob quarters with tangled white lines. HED shows a soft white cross along the borders between the quarters, with faint traces of the stripes and the noise. PiDiNet shows a sharper white cross and almost nothing inside the quarters.](../../assets/figures/learned-edges-dark.svg#only-dark){ width="480" }
  <figcaption>The texture image of the edge pages: stripes, fine noise, soft blobs and a flat gray. Then the Canny edges of scikit-image with its defaults, and the edge probability of HED and of PiDiNet.</figcaption>
</figure>

## How it works

--8<-- "filters/learned-edges-steps.md"

## Mathematical foundation

--8<-- "filters/learned-edges-formula.md"

HED trains a side output after each of the five stages of VGG16, so every scale learns to predict edges on its own. Deep supervision makes the early stages useful, and the fused map combines fine and coarse edges. PiDiNet replaces plain convolutions with pixel difference convolutions. They take differences between neighbors before weighting, as Sobel or Laplacian kernels do. After training, they can be rewritten as plain convolutions, which is how PixelNexus runs them.

## Kernel or operator

A trained network has many learned kernels, not one. The Inspector shows the stages and the model with its license.

## Parameters

--8<-- "filters/learned-edges-params.md"

## Implementation

`learned_edges` in `engine/src/pixelnexus_engine/filters/learned.py` runs the ONNX file that `tools/export_models.py` wrote. For HED, the tool rebuilds the network from its `deploy.prototxt` in PyTorch and reads the weights from the Caffe file with Caffe's own `caffe.proto`. Caffe's pooling rounds up, and the side outputs are cropped to the input around their center, as OpenCV's HED sample does. The export is kept only when it matches OpenCV 4's Caffe importer, here to within 3e-6. HED reads BGR from 0 to 255 minus the mean of its training images, from the HED tutorial. PiDiNet runs as the converted plain network of its paper, with the settings of its Table 5 model. Both networks pool four times, so large images run in tiles of 768 pixels that start at multiples of 16, with 128 pixels of margin.

## Worked example

--8<-- "examples/learned-edges.md"

Canny responds more inside the textured quarters than on the borders between them. Both learned detectors do the opposite. HED marks the borders at 155.7 and the insides at 4 to 12. PiDiNet is sharper still, 203.1 on the borders and under 9 inside. The flat quarter stays dark for all three.

## Complexity

--8<-- "filters/learned-edges-complexity.md"

## Artifacts and limitations

--8<-- "filters/learned-edges-limits.md"

## Tests

A tiny ONNX model made inside the tests checks that each network gets its own normalization. Where the real models are downloaded and exported, both must mark the outline of a disk far above its inside. HED tiles on the pooling grid must equal a run on the whole image.

--8<-- "filters/learned-edges-tests.md"

## References

--8<-- "filters/learned-edges-references.md"
