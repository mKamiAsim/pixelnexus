# High-pass filter

--8<-- "filters/high-pass-facts.md"

## Overview

The high-pass filter keeps only the fine detail of an image. It subtracts a Gaussian blur from the image, so flat areas become 0 and edges remain. The result is signed, so the output mapping turns it into a picture. By default it adds 128, which makes flat areas middle gray.

<figure markdown="span">
  ![Three panels: a Siemens star, its high-pass with sigma 1, and with sigma 4. Both results are middle gray in flat areas. Sigma 1 keeps thin lines at the spoke edges, sigma 4 keeps wider bands.](../../assets/figures/high-pass-light.svg#only-light){ width="480" }
  ![Three panels: a Siemens star, its high-pass with sigma 1, and with sigma 4. Both results are middle gray in flat areas. Sigma 1 keeps thin lines at the spoke edges, sigma 4 keeps wider bands.](../../assets/figures/high-pass-dark.svg#only-dark){ width="480" }
  <figcaption>The high-pass keeps the edges of the spokes and turns flat areas middle gray.</figcaption>
</figure>

## How it works

1. Make a blurred copy of the image.
2. Subtract the copy from the image.
3. Add 128, so the signed detail can be seen as lighter and darker gray.

## Mathematical foundation

--8<-- "filters/high-pass-formula.md"

The filter is one kernel: a unit impulse minus the Gaussian kernel. Its weights add up to 0, so flat areas give exactly 0. The Gaussian passes low frequencies, so the difference passes the high ones. Its frequency response is close to \(1 - e^{-2\pi^2 \sigma^2 f^2}\) for the frequency \(f\) in cycles per pixel. That is an approximation, because the Gaussian kernel is sampled and cut off at 3 sigma.

## Kernel or operator

The kernel for \(\sigma = 0.5\), from the filter code. The weights add up to 0.

--8<-- "kernels/high-pass.md"

## Algorithm

--8<-- "filters/high-pass-steps.md"

## Parameters

--8<-- "filters/high-pass-params.md"

## Implementation

`boostPlane` in `web/src/core/filters/linear/high-pass.ts` blurs with the Gaussian filter code and subtracts. The high-boost filter shares this function. The filter works on luma by default, so the result is gray.

## Worked example

--8<-- "examples/high-pass.md"

## Complexity

--8<-- "filters/high-pass-complexity.md"

## Artifacts and limitations

--8<-- "filters/high-pass-limits.md"

## Tests

The test compares the signed result before the output mapping with the image minus `scipy.ndimage.gaussian_filter`, for two sigmas and three border modes.

--8<-- "filters/high-pass-tests.md"

## References

--8<-- "filters/high-pass-references.md"
