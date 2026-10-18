# Deriche

--8<-- "filters/deriche-facts.md"

## Overview

The Deriche operator finds the gradient of the image with the derivative filter that Deriche derived from Canny's criteria, for a filter of infinite length. It runs as a recursive filter, a pass forward and a pass backward along each row and column. So its cost stays the same however much it smooths. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels. A noisy bright disk and gray square on a dark ground. With alpha 2, the outlines of the disk and the square are thin gray rings on a dark, faintly grainy background. With alpha 1, the rings are a little wider. With alpha 0.5, they are wide soft bands on an almost black background.](../../assets/figures/deriche-light.svg#only-light){ width="480" }
  ![Four panels. A noisy bright disk and gray square on a dark ground. With alpha 2, the outlines of the disk and the square are thin gray rings on a dark, faintly grainy background. With alpha 1, the rings are a little wider. With alpha 0.5, they are wide soft bands on an almost black background.](../../assets/figures/deriche-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 10. Then the Deriche gradient magnitude with alpha 2, 1 and 0.5.</figcaption>
</figure>

## How it works

--8<-- "filters/deriche-steps.md"

## Mathematical foundation

--8<-- "filters/deriche-formula.md"

Canny's optimal edge filter has no closed form, and his practical choice was the derivative of a Gaussian. Deriche dropped the limit on the filter's length and found an exact optimum, a sine under an exponential envelope. As omega goes to 0, it tends to x times the exponential. A sum of exponentials can be computed by a recursion with a few terms, which is what makes it fast.

## Kernel or operator

There is no finite kernel. The filter is recursive. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/deriche-params.md"

## Implementation

`deriche` in `engine/src/pixelnexus_engine/filters/deriche.py` rounds the luma to 8 bits and calls `cv2.ximgproc.GradientDericheX` and `GradientDericheY`. The magnitude is shown in levels, clipped at 255, without a stretch, so the brightness of an edge tells its height.

## Worked example

--8<-- "examples/deriche.md"

Halving alpha roughly halves the response to noise, from 14.46 at alpha 4 to 1.12 at alpha 0.25, at the same cost. At alpha 1 and above, the step of 150 levels peaks at exactly 150. At smaller alpha it peaks higher, 184 at alpha 0.25. The filter is then wider than the 20 pixels on each side of the step. We did not trace how OpenCV's scaling and its start at the image edge add up there.

## Complexity

--8<-- "filters/deriche-complexity.md"

## Artifacts and limitations

--8<-- "filters/deriche-limits.md"

## Tests

The gradients must equal OpenCV's own calls on the luma. A step of 150 must peak at 150 at the default alpha, and the signed output must show 128 plus half the gradient. On a large noisy flat image, a smaller alpha must give a smaller response. The representation must have its three stages.

--8<-- "filters/deriche-tests.md"

## References

--8<-- "filters/deriche-references.md"
