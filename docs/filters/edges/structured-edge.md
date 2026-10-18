# Structured Edge Detector

--8<-- "filters/structured-edge-facts.md"

## Overview

The Structured Edge Detector of Dollar and Zitnick learned what an edge is from people. It was trained on the BSDS500 photos, where people drew the outlines of objects. A forest of decision trees looks at small patches of the image and predicts whole patches of edges. So it marks the borders of objects and regions and stays quiet on texture, where gradient detectors such as Canny mark every change. The filter runs in the PixelNexus engine, with OpenCV.

It needs an optional model of 6.4 MB. The model downloads only when you click **Download model** in the Properties panel, which first shows its size and license. It goes to the engine's models folder on your own computer, which git ignores, and the engine checks its SHA-256 before it keeps it. The model comes from Dollar's Structured Edge Detection Toolbox, converted for OpenCV. Its license, the Microsoft Research License, allows non-commercial use only, such as teaching, research and personal experiments. That is why it is not part of PixelNexus, whose own code is under the MIT license.

<figure markdown="span">
  ![Four panels. The input has vertical stripes, fine noise, coarse blurred noise and a flat gray in its four quarters. Canny marks every stripe and fills the noise quarters with tangled white lines. The structured edge probability is dark almost everywhere, with a soft gray cross along the borders between the quarters. The thin edges keep that cross as thin lines, with a few faint traces in the coarse noise.](../../assets/figures/structured-edge-light.svg#only-light){ width="480" }
  ![Four panels. The input has vertical stripes, fine noise, coarse blurred noise and a flat gray in its four quarters. Canny marks every stripe and fills the noise quarters with tangled white lines. The structured edge probability is dark almost everywhere, with a soft gray cross along the borders between the quarters. The thin edges keep that cross as thin lines, with a few faint traces in the coarse noise.](../../assets/figures/structured-edge-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with four textures: stripes, fine noise, coarse noise and a flat gray with faint noise. Then the Canny edges of scikit-image with its defaults, and the structured edges as a probability and thinned.</figcaption>
</figure>

## How it works

--8<-- "filters/structured-edge-steps.md"

## Mathematical foundation

--8<-- "filters/structured-edge-formula.md"

A classic detector decides edge or no edge at each pixel from a local rule, such as a large gradient. A structured forest predicts a whole patch of edge labels at once, so its output has the shape of real outlines: lines that continue, corners and junctions. Training such trees needs a trick, since a patch of labels has no simple order. Dollar and Zitnick map the label patches into a simpler space and group them into a few classes at each split, so a tree can use the usual split rules. The details are in their paper.

Because the forest learned from outlines drawn by people, it treats texture as the inside of a region, not as edges. That is what the worked example shows. It also means that it works best on photos like those it learned from.

## Kernel or operator

There is no kernel. The trees and their thresholds are in the model file. The Inspector shows the stages with the current settings.

## Parameters

--8<-- "filters/structured-edge-params.md"

## Implementation

`structured_edge` in `engine/src/pixelnexus_engine/filters/structured_edge.py` loads the model with `cv2.ximgproc.createStructuredEdgeDetection`, once per engine process. It passes the RGB image as floats from 0 to 1, as OpenCV asks, to `detectEdges`. The model file sets its options. It has 8 trees, and 4 of them run at each position. Patches of 32 pixels predict edge patches of 16 pixels, with a stride of 2 and 4 gradient orientations. The thin edges use `computeOrientation` and then `edgesNms` with the thinning radius, the border radius and the multiplier. The orientation output shows 0 to pi from black to white.

The model is listed in `catalog/models.yaml` with its source, size, license and SHA-256. The engine route `POST /api/v1/models/{id}/download` fetches it, writes it to a temporary file, checks the SHA-256, and only then moves it into place. Without the model, the filter stops with a message that says to download it.

## Worked example

--8<-- "examples/structured-edge.md"

Inside the four textures, the structured edges stay below 50 almost everywhere, while Canny marks hundreds to thousands of pixels in each. Along the borders between the quarters, where one texture meets another, the structured edges are strongest. This test image is synthetic, so the edge values are lower than on photos.

## Complexity

--8<-- "filters/structured-edge-complexity.md"

## Artifacts and limitations

--8<-- "filters/structured-edge-limits.md"

## Tests

The catalog must list the model with its size, license and SHA-256. A download from a local file must be checked and moved into place, and a download with the wrong checksum must not be kept. Without the model, the filter must ask for the download. With the model downloaded, its SHA-256 must match, the three outputs must equal OpenCV's, and the thin edges must lie on the outline of a disk and not inside it. These last tests skip on a machine without the model. The engine API must list the model and refuse an unknown one. An E2E test checks that the studio shows the size and license, and downloads only on a click.

--8<-- "filters/structured-edge-tests.md"

## References

--8<-- "filters/structured-edge-references.md"
