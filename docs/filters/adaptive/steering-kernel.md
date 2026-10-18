# Steering kernel regression

--8<-- "filters/steering-kernel-facts.md"

## Overview

Steering kernel regression, by Takeda, Farsiu and Milanfar, removes noise by fitting a small polynomial surface around each pixel. The fit weights the neighbors with a kernel shaped by the local edges. Near an edge the kernel is long and thin along it, so the fit averages along the edge and not across it. In a flat area the kernel is wide and round. The kernel shapes come from the gradients of the image, and they are estimated again from each result for a few iterations. The filter runs in the PixelNexus engine, in PixelNexus's own code.

<figure markdown="span">
  ![Four panels. The noisy input shows a dark area and a light area split by a diagonal edge, crossed by three thin bright lines, all under heavy grain. Classic regression removes the grain but turns the lines into wide soft bands and blurs the edge. Steering regression with 1 pass removes most of the grain and keeps the lines thin and the edge sharp, with faint wavy patterns in the flat areas. With 3 passes, the flat areas are smoother and the lines stay thin.](../../assets/figures/steering-kernel-light.svg#only-light){ width="480" }
  ![Four panels. The noisy input shows a dark area and a light area split by a diagonal edge, crossed by three thin bright lines, all under heavy grain. Classic regression removes the grain but turns the lines into wide soft bands and blurs the edge. Steering regression with 1 pass removes most of the grain and keeps the lines thin and the edge sharp, with faint wavy patterns in the flat areas. With 3 passes, the flat areas are smoother and the lines stay thin.](../../assets/figures/steering-kernel-dark.svg#only-dark){ width="480" }
  <figcaption>A step and three thin lines with noise of sigma 20. Then classic kernel regression of order 2 with h 2, and steering kernel regression with 1 and 3 iterations.</figcaption>
</figure>

## How it works

--8<-- "filters/steering-kernel-steps.md"

## Mathematical foundation

--8<-- "filters/steering-kernel-formula.md"

Kernel regression treats the image as samples of an unknown smooth function. Near each pixel, it fits a polynomial of order N by weighted least squares. The constant term is the estimate, and the linear terms are the gradient. Classic kernel regression uses the same round kernel everywhere, so it blurs edges. The paper shows that the bilateral filter is the same fit of order 0, with a kernel that also weights brightness.

The steering kernel adapts the shape instead. For each sample, the gradients in a small window form a matrix G. Its two singular values s_1 and s_2 measure the energy along the main gradient direction and across it. On an edge, s_1 is much larger than s_2, so the kernel gets long along the edge. In a flat area both are small, so the kernel is round, and its scale gamma makes it large.

## Kernel or operator

Each pixel has its own kernel, so there is no fixed one. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/steering-kernel-params.md"

## Implementation

`steering_kernel` in `engine/src/pixelnexus_engine/filters/steering_kernel.py` follows Section III of the paper and its Fig. 10. It sums the weighted normal equations over the window with NumPy, and solves one small system per pixel with `numpy.linalg.solve`. The singular values of G come from the eigenvalues of the 2 x 2 matrix G^T G, which gives the same C_i as the paper's SVD. The regularization values lambda' = 1.0 and lambda'' = 0.01 are the paper's. The first gradients come from a classic regression with the same h and order, at least 1. The paper names this start but not its settings, so that is our choice, as are the window sizes and the border.

## Worked example

--8<-- "examples/steering-kernel.md"

The thin lines dominate the error, since classic regression spreads them into wide bands. That is why its RMSE, 19.04, is close to the noisy input. Steering regression keeps the lines and roughly halves the error. More iterations do not always help. At order 2 the error is lowest after 1 to 3 passes, and at order 0 after 1. The paper notes the same trade: each pass removes noise but adds blur, and its best results took 3 to 7 passes.

## Complexity

--8<-- "filters/steering-kernel-complexity.md"

## Artifacts and limitations

--8<-- "filters/steering-kernel-limits.md"

## Tests

At order 0, the classic regression must equal a normalized Gaussian average. At order 2, both the classic and the steered fit must give back a quadratic surface and its gradient to 1e-6. The steering matrix must equal the one built from an SVD exactly as in Eq. 50 to 54. A flat area must get the round kernel of scale sqrt(0.01 / 25). On a straight edge, the narrow direction must lie along the gradient, with the ratio (s_1 + 1)^2. On a noisy edge, the result must beat classic regression and keep the edge sharper. Order 0 and the progress reports are checked too.

--8<-- "filters/steering-kernel-tests.md"

## References

--8<-- "filters/steering-kernel-references.md"
