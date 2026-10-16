# BM3D-inspired denoising

--8<-- "filters/bm3d-lite-facts.md"

## Overview

BM3D, by Dabov, Foi, Katkovnik and Egiazarian, is one of the strongest classical denoisers. This filter is a simplified version in PixelNexus's own code. The full BM3D package is left out because its license is unclear. For each small patch, the filter gathers similar patches from nearby and stacks them into a 3D group. Because the patches share their real content, the noise can be removed from the whole stack at once. A first step uses a hard threshold. A second step uses a Wiener filter, guided by the result of the first. The filter runs in the PixelNexus engine.

<figure markdown="span">
  ![Four panels. The clean image has dark and gray vertical stripes on the left half and a light flat area with a lighter disk on the right. The noisy image is covered in grain. The basic estimate shows sharp stripes and a clean disk with faint grain left in the flat area. The final estimate looks the same, with the flat area slightly smoother.](../../assets/figures/bm3d-lite-light.svg#only-light){ width="480" }
  ![Four panels. The clean image has dark and gray vertical stripes on the left half and a light flat area with a lighter disk on the right. The noisy image is covered in grain. The basic estimate shows sharp stripes and a clean disk with faint grain left in the flat area. The final estimate looks the same, with the flat area slightly smoother.](../../assets/figures/bm3d-lite-dark.svg#only-dark){ width="480" }
  <figcaption>Stripes 3 pixels wide beside a flat area with a disk, then with noise of sigma 20. Then the basic estimate of the first step and the final estimate, with sigma set to 20.</figcaption>
</figure>

## How it works

--8<-- "filters/bm3d-lite-steps.md"

## Mathematical foundation

--8<-- "filters/bm3d-lite-formula.md"

Similar patches make a group with strong correlation in all three directions. In a 3D transform, its signal gathers in a few large coefficients, while white noise spreads evenly over all of them. Setting small coefficients to 0 then removes most of the noise and keeps most of the signal. Each pixel lies in many patches, and many groups, so it gets many estimates. They are averaged with weights that favor groups with fewer coefficients left, since those are more reliable.

The second step uses the basic estimate as a guide. Matching on it is more reliable than on the noisy image. Its transform also tells how much signal each coefficient holds, which sets the Wiener factor omega for the same coefficient of the noisy group.

## Kernel or operator

The filter has no kernel. Each group gets its own filtering in the transform domain. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/bm3d-lite-params.md"

## Implementation

`bm3d_lite` in `engine/src/pixelnexus_engine/filters/bm3d_lite.py` follows the step-by-step description of Lebrun's IPOL analysis. It uses the values of his parameter table. Patches are 8 x 8 with a step of 3, and groups hold up to 16 and 32 patches. The threshold is 2.7 sigma. The matching thresholds are 2500 and 400, or 5000 and 3500 above sigma 40. The reference patch always leads its group. Several parts are simpler than the full method, our choices:

- Every transform is the orthonormal DCT, in 2D within the patches and in 1D across them. Lebrun's tables use this variant.
- There is no Kaiser window in the aggregation. Lebrun found it does not raise the PSNR.
- The 2D pre-threshold of the matching above sigma 40 is left out.
- Each channel is processed on its own, not in the paper's opponent color space.

## Worked example

--8<-- "examples/bm3d-lite.md"

The first step does most of the work. It raises the PSNR by 16 to 18 dB. On this simple scene the second step adds nothing at sigma 10 and 20, and it loses about 0.3 dB at sigma 30 and 50. The stripes and the flat area are already almost perfect after the first step. On a scene with fine texture of a few levels, the second step helped, by 0.4 to 3.2 dB. The estimated sigma stays within 1 level of the truth up to sigma 30. With the estimate, the result is within 0.1 dB of the result with the true value.

## Complexity

--8<-- "filters/bm3d-lite-complexity.md"

## Artifacts and limitations

--8<-- "filters/bm3d-lite-limits.md"

## Tests

The matching thresholds must follow Lebrun's table, and the grid must step by 3 and end at the last patch. The matching must keep the closest patches within the threshold, with the reference first. Near the image border, the search window must be cut. A flat image must stay flat, apart from the small shrink of the Wiener factor, and a tiny sigma must leave the image. At sigma 10 and 30 the first step must gain at least 6 dB and the second must gain more. A sigma of 0 must estimate the noise near its true value. The outputs and the representation are checked too.

--8<-- "filters/bm3d-lite-tests.md"

## References

--8<-- "filters/bm3d-lite-references.md"
