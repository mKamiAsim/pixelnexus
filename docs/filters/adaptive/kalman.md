# Kalman filter

--8<-- "filters/kalman-facts.md"

## Overview

The Kalman filter estimates a signal that follows a known model from noisy measurements. Here each row of the image is the signal. The model says that the next clean value is the last one times rho, plus a small change. The filter blends this guess with the noisy pixel, and trusts the pixel less the noisier the image is. A Rauch-Tung-Striebel smoother then runs back along the row, so each estimate also uses the pixels after it. The columns of the noisy image get the same, and the result is the mean of both runs.

This separable form is PixelNexus's own. The reduced update Kalman filter of Woods and Radewan uses a model in two dimensions, which this filter does not.

<figure markdown="span">
  ![A plot of one row through three disks: the clean steps, the noisy row and the Kalman result. The result follows the steps with much less noise, and rounds the top of the narrow disk.](../../assets/figures/kalman-light.svg#only-light){ width="480" }
  ![A plot of one row through three disks: the clean steps, the noisy row and the Kalman result. The result follows the steps with much less noise, and rounds the top of the narrow disk.](../../assets/figures/kalman-dark.svg#only-dark){ width="480" }
  <figcaption>The Kalman smoother removes most of the noise. It rounds the steps, most at the narrow disk.</figcaption>
</figure>

## How it works

1. Along a row, guess the next clean value from the last one.
2. Blend the guess with the noisy pixel. The noisier the image, the more the guess counts.
3. Run back along the row, so every pixel also learns from the pixels after it.
4. Do the same on the columns, and take the mean of both.

## Mathematical foundation

--8<-- "filters/kalman-formula.md"

The Kalman gain K is the share of the new pixel in the estimate. When the prediction is uncertain, P^- is large and K is near 1, so the pixel counts most. When the noise is large, K is small, and the prediction counts most. For this model the Kalman filter gives the estimate with the least mean squared error among all linear estimates.

The model needs rho and the signal variance. White noise adds its variance to the variance of the pixels, but not to the covariance of neighbors. So the filter takes the noise variance off the pixel variance, and divides the neighbor covariance by the result to get rho.

The first design ran the columns of the row result. That was tried and rejected. After the row pass the image looks almost free of noise along the columns, so rho came out as 1, and the edges blurred far along the columns.

## Kernel or operator

There is no fixed kernel. The gain changes along each line. The Inspector shows the model, the filter and the smoother.

## Algorithm

--8<-- "filters/kalman-steps.md"

## Parameters

--8<-- "filters/kalman-params.md"

## Implementation

`kalmanPlane` in `web/src/core/filters/adaptive/scan.ts` estimates one model for the rows and one for the columns with `arModel`. `kalmanLine` runs the filter forward and the smoother back on one line. Each line starts from the image mean, with the signal variance as its uncertainty. The filter needs whole lines, so it runs on the whole image at once.

## Worked example

--8<-- "examples/kalman.md"

On the disks, the Kalman filter is as good as a box filter, with the noise level as its only setting. On the stripes it keeps more than any fixed average, since its model follows the steep changes along each line. The adaptive predictors do better there.

## Complexity

--8<-- "filters/kalman-complexity.md"

## Artifacts and limitations

--8<-- "filters/kalman-limits.md"

## Tests

A NumPy version of the same model, filter and smoother, in `tools/fixtures_scan.py`, gives the reference for noise sigma 5, 20 and 40. Before it is used, the script checks that a noise sigma near 0 gives the image back.

--8<-- "filters/kalman-tests.md"

## References

--8<-- "filters/kalman-references.md"
