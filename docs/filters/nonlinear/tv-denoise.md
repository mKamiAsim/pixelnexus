# Total variation denoising

--8<-- "filters/tv-denoise-facts.md"

## Overview

Total variation denoising finds the image closest to yours that has the least total variation, after Rudin, Osher and Fatemi. Total variation adds up the size of the gradient over the image. Noise adds a lot of it, while one sharp edge adds only its height. So the result keeps sharp edges and turns noisy areas flat. The filter runs in the PixelNexus engine, with scikit-image's two solvers.

<figure markdown="span">
  ![Four panels. A noisy bright disk and gray square on a dark ground. With a weight of 0.1, the noise is mostly gone and the edges are sharp, with a faint grain left. With a weight of 0.4, the shapes are smooth but their edges look soft and their contrast lower. With split Bregman at 0.1, the result looks like the first, a little smoother.](../../assets/figures/tv-denoise-light.svg#only-light){ width="480" }
  ![Four panels. A noisy bright disk and gray square on a dark ground. With a weight of 0.1, the noise is mostly gone and the edges are sharp, with a faint grain left. With a weight of 0.4, the shapes are smooth but their edges look soft and their contrast lower. With split Bregman at 0.1, the result looks like the first, a little smoother.](../../assets/figures/tv-denoise-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 20. Then total variation denoising with Chambolle's solver at a weight of 0.1 and 0.4, and with split Bregman at 0.1.</figcaption>
</figure>

## How it works

--8<-- "filters/tv-denoise-steps.md"

## Mathematical foundation

--8<-- "filters/tv-denoise-formula.md"

The model is an energy, not a recipe. Any solver that finds its minimum gives the same image, in theory. Chambolle solves the dual problem with a projection. Goldstein and Osher split the gradient into a separate variable, and solve two simpler problems in turn.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/tv-denoise-params.md"

## Implementation

`tv_denoise` in `engine/src/pixelnexus_engine/filters/edge_preserving.py` passes each plane of the channel scope, scaled from 0 to 1, to `skimage.restoration.denoise_tv_chambolle` with the weight w, or to `denoise_tv_bregman` with 1 / (2 w). That is how the scikit-image docstrings relate their weights to the same lambda.

The two solvers do not give the same image, though. On a noisy disk, even after 2000 steps with a tight tolerance, no split Bregman weight came within 22 levels of Chambolle's result everywhere. Their discrete total variations or stop rules must differ, and we did not trace which. So treat them as two filters that share a model, not as two routes to one answer.

## Worked example

--8<-- "examples/tv-denoise.md"

Both solvers raise the PSNR by 11 to 14 dB. They differ at the same weight: at 0.1, split Bregman scores 1.5 dB higher than Chambolle. At a weight of 0.4, the figure shows that edges lose contrast. Total variation keeps edges sharp, but it shrinks the height of small shapes.

## Complexity

--8<-- "filters/tv-denoise-complexity.md"

## Artifacts and limitations

--8<-- "filters/tv-denoise-limits.md"

## Tests

Each solver must get the weight its docstring defines, compared with a direct call. On a noisy step, both must bring the error below 0.6 of the input's. The representation must have its three stages.

--8<-- "filters/tv-denoise-tests.md"

## References

--8<-- "filters/tv-denoise-references.md"
