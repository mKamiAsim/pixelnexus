# Robust M-estimator filter

--8<-- "filters/m-estimator-facts.md"

## Overview

The M-estimator filter replaces each pixel with a robust mean of its window. Pixels far from the current estimate count less, or not at all. So impulse noise and the pixels on the other side of an edge barely pull the result. It sits between the mean, which every pixel pulls, and the median, which ignores how far pixels are. The filter runs in the PixelNexus engine, with our own code.

<figure markdown="span">
  ![Four panels. A bright disk and gray square on a dark ground, covered with fine noise and many black and white dots. The 5 by 5 median, the Tukey result and the Huber result all show clean shapes with sharp edges and almost no dots.](../../assets/figures/m-estimator-light.svg#only-light){ width="480" }
  ![Four panels. A bright disk and gray square on a dark ground, covered with fine noise and many black and white dots. The 5 by 5 median, the Tukey result and the Huber result all show clean shapes with sharp edges and almost no dots.](../../assets/figures/m-estimator-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with Gaussian noise of sigma 10 and 10 percent of pixels set to black or white. Then a 5 x 5 median, and the M-estimator with Tukey and with Huber weights, both with a scale of 10.</figcaption>
</figure>

## How it works

--8<-- "filters/m-estimator-steps.md"

## Mathematical foundation

--8<-- "filters/m-estimator-formula.md"

Huber proposed estimators that behave like the mean for small residuals and like the median for large ones. Tukey's biweight goes further and gives far residuals no weight at all. Neither has a closed form, so each step reweighs the pixels by the current residuals and takes the weighted mean. Holland and Welsch made this iteratively reweighted least squares a standard tool. A redescending estimator such as Tukey's needs a good start, so the filter starts from the median.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/m-estimator-params.md"

## Implementation

`m_estimator` in `engine/src/pixelnexus_engine/filters/robust.py` runs on each plane of the channel scope. It starts from the window median, then reweighs for the given number of steps. Where all weights in a window are 0, which only Tukey's weights allow, the pixel keeps its last estimate. With a scale of 0, the filter estimates it from the channel with `skimage.restoration.estimate_sigma`.

## Worked example

--8<-- "examples/m-estimator.md"

The best result here is Huber's at a scale of 10, the sigma of the Gaussian noise, with 37.64 dB against 36.94 dB for the median. Tukey does not beat the median on this image, except by 0.02 dB at a scale of 20. The automatic scale comes out at 25 levels here, since the impulses inflate the noise estimate, so it does worse than a scale set by hand. Set the scale near the Gaussian noise sigma when you know it.

## Complexity

--8<-- "filters/m-estimator-complexity.md"

## Artifacts and limitations

--8<-- "filters/m-estimator-limits.md"

## Tests

Huber's and Tukey's weights must match their formulas. The result must match a direct reweighting loop to 1e-12. On a step with Gaussian noise and impulses, Tukey must beat the 5 x 5 median and keep the edge. A pixel whose weights are all 0 must keep its estimate. The representation must have its three stages.

--8<-- "filters/m-estimator-tests.md"

## References

--8<-- "filters/m-estimator-references.md"
