# Rolling guidance filter

--8<-- "filters/rolling-guidance-facts.md"

## Overview

The rolling guidance filter removes small structures, such as texture, fine detail and noise, and keeps large edges sharp, after Zhang, Shen, Xu and Jia. It first blurs everything with a Gaussian of the scale. Then a few joint bilateral filters of the original image, each guided by the last result, let the large edges roll back in. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels. A bright disk and gray square on a dark ground covered with a grid of small bright dots. With the paper start, the dots are gone and the disk and square have sharp edges. With the OpenCV start, the dots are still there. With a scale of 1.5, the dots are also still there.](../../assets/figures/rolling-guidance-light.svg#only-light){ width="480" }
  ![Four panels. A bright disk and gray square on a dark ground covered with a grid of small bright dots. With the paper start, the dots are gone and the disk and square have sharp edges. With the OpenCV start, the dots are still there. With a scale of 1.5, the dots are also still there.](../../assets/figures/rolling-guidance-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square on a ground with a grid of small bright dots. Then the filter with the paper start, with the OpenCV start, and with a scale of 1.5.</figcaption>
</figure>

## How it works

--8<-- "filters/rolling-guidance-steps.md"

## Mathematical foundation

--8<-- "filters/rolling-guidance-formula.md"

The first step decides what survives. The Gaussian blur wipes out every structure smaller than the scale, and blurs the large ones. Later steps are joint bilateral filters of the original image, whose color weights come from the guide. Where the guide still shows a large edge, the weights follow it, and the edge comes back sharp. The small structures are gone from the guide, so nothing brings them back.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/rolling-guidance-params.md"

## Implementation

`rolling_guidance` in `engine/src/pixelnexus_engine/filters/edge_preserving.py` has two starts. The paper start blurs the image with `cv2.GaussianBlur` and then runs `cv2.ximgproc.jointBilateralFilter` for the remaining steps. The OpenCV start calls `cv2.ximgproc.rollingGuidanceFilter`. Its source starts the guide from the image itself, not from a blur. So its first step is an ordinary bilateral filter, which keeps small structures with strong edges.

## Worked example

--8<-- "examples/rolling-guidance.md"

This example has no noise. It shows the purpose of the filter, removing small structures. With the paper start, the dots go and the PSNR against the image without dots rises from 24.61 dB to 34.07 dB. With OpenCV's start, the dots stay, and the PSNR does not move. Their edges are strong, so the bilateral steps keep them. At a scale of 1.5, the dots, 2 pixels wide, are about as large as the scale, so they stay too.

## Complexity

--8<-- "filters/rolling-guidance-complexity.md"

## Artifacts and limitations

--8<-- "filters/rolling-guidance-limits.md"

## Tests

The OpenCV start must equal `rollingGuidanceFilter`, and the paper start a Gaussian blur followed by joint bilateral filters. On a grid of small dots, the paper start must remove the dots and the OpenCV start must keep them. The representation must have its three stages for both starts.

--8<-- "filters/rolling-guidance-tests.md"

## References

--8<-- "filters/rolling-guidance-references.md"
