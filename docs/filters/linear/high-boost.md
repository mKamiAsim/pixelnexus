# High-boost filter

--8<-- "filters/high-boost-facts.md"

## Overview

The high-boost filter takes A times the image and subtracts a Gaussian blur of it. It is a sharpening filter that also sets how much of the original brightness stays. With A = 1 it leaves only the detail, like the [high-pass filter](high-pass.md). With A = 2 it is the same as the [unsharp mask](unsharp-mask.md) with amount 1.

<figure markdown="span">
  ![A line plot across a soft edge for boost A 1.5, 2 and 2.5. A 1.5 lowers the whole curve, A 2 keeps the levels and sharpens the edge, A 2.5 raises the curve and clips the bright side.](../../assets/figures/high-boost-light.svg#only-light){ width="480" }
  ![A line plot across a soft edge for boost A 1.5, 2 and 2.5. A 1.5 lowers the whole curve, A 2 keeps the levels and sharpens the edge, A 2.5 raises the curve and clips the bright side.](../../assets/figures/high-boost-dark.svg#only-dark){ width="480" }
  <figcaption>The boost A sets the brightness. A = 2 sharpens and keeps it.</figcaption>
</figure>

## How it works

1. Make a blurred copy of the image.
2. Multiply the image by the boost A.
3. Subtract the blurred copy.

## Mathematical foundation

--8<-- "filters/high-boost-formula.md"

The kernel is \(A\,\delta - G_\sigma\), and its weights add up to \(A - 1\). That number is the gain for flat areas. So A below 2 darkens the image, A = 2 keeps its brightness, and A above 2 brightens it. The detail on top is always the high-pass \(I - G_\sigma \star I\), at full strength.

The unsharp mask with amount \(a\) is \(I + a (I - G \star I) = (1 + a) I - a\, G \star I\). Divided by \(a\), this is the high-boost with \(A = (1 + a)/a\). So both filters have the same shape of response, and only the gain differs.

## Kernel or operator

The kernel for \(\sigma = 0.5\) and \(A = 2\), from the filter code. The weights add up to 1.

--8<-- "kernels/high-boost.md"

## Algorithm

--8<-- "filters/high-boost-steps.md"

## Parameters

--8<-- "filters/high-boost-params.md"

## Implementation

`boostPlane` in `web/src/core/filters/linear/high-pass.ts` computes \(A I - G \star I\) with the Gaussian filter code. The high-pass filter calls the same function with \(A = 1\). Results past 0 or 255 are clipped.

## Worked example

--8<-- "examples/high-boost.md"

## Complexity

--8<-- "filters/high-boost-complexity.md"

## Artifacts and limitations

--8<-- "filters/high-boost-limits.md"

## Tests

The test compares the filter with A times the image minus `scipy.ndimage.gaussian_filter`, for two sigmas, three boosts and three border modes. A unit test checks that the kernel weights add up to A - 1.

--8<-- "filters/high-boost-tests.md"

## References

--8<-- "filters/high-boost-references.md"
