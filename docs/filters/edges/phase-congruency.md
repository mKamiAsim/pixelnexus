# Phase congruency

--8<-- "filters/phase-congruency-facts.md"

## Overview

Split a signal into sine waves, and look at a step or a thin line. There, all the waves reach a peak or cross zero at the same point: their phases agree. Phase congruency measures this agreement, from 0 to 1. Kovesi built a version for images with log-Gabor filters, noise compensation and a weight for the spread of the frequencies. It finds steps and lines by their shape, not by their contrast, so a faint edge counts about as much as a strong one. From the same computation it gives edges, corners and the type of each feature. The filter runs in the PixelNexus engine, in our own code after Kovesi's.

<figure markdown="span">
  ![Four panels. The input has light that rises from left to right, a faint square at the top left, a strong square at the top right, and a bright and a dark vertical line below them. The edges show both squares with the same bright outline, and both lines with brighter blobs at their ends. The corners show bright dots at the corners of the squares and at the ends of the lines, and only faint sides. The feature type is mid gray except on the features. The bright line is white, the dark line black, and each square edge has a light rim inside and a dark rim outside.](../../assets/figures/phase-congruency-light.svg#only-light){ width="480" }
  ![Four panels. The input has light that rises from left to right, a faint square at the top left, a strong square at the top right, and a bright and a dark vertical line below them. The edges show both squares with the same bright outline, and both lines with brighter blobs at their ends. The corners show bright dots at the corners of the squares and at the ends of the lines, and only faint sides. The feature type is mid gray except on the features. The bright line is white, the dark line black, and each square edge has a light rim inside and a dark rim outside.](../../assets/figures/phase-congruency-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with light that rises from left to right, a faint square (+20) and a strong square (+60), and a bright and a dark line. Then the edges, the corners and the feature type with the defaults.</figcaption>
</figure>

## How it works

--8<-- "filters/phase-congruency-steps.md"

## Mathematical foundation

--8<-- "filters/phase-congruency-formula.md"

A log-Gabor filter on one side of the spectrum gives a complex response. The real part is the response of an even filter, which looks like a line. The imaginary part is the response of an odd filter, which looks like a step. Together they give the local amplitude A and phase phi at each scale.

Where all scales have the same phase, the sum of the responses is as long as the sum of their amplitudes, and the ratio is 1. Kovesi's measure uses cos minus the absolute sine of the phase difference. It falls off faster than the cosine alone as the phases drift apart. Dividing by the summed amplitudes removes the contrast. Multiplying the image by a number scales every amplitude, the noise threshold included, so the result stays the same.

Noise also has phase, and in a flat area the few small responses can agree by chance. Kovesi assumes Gaussian noise, whose filter amplitudes follow a Rayleigh distribution. Its median at the smallest scale gives the Rayleigh parameter tau. Kovesi scales the expected noise of each larger scale down by the factor mult, in line with its smaller bandwidth. The threshold T is the mean plus k standard deviations of the summed noise amplitudes. Energy below T counts as 0.

At a point where only one scale responds, all phases trivially agree. The weight W uses the spread of the amplitudes over the scales, from 0 when one scale dominates to 1 when all are equal. A sigmoid with the cutoff and the sharpness g lowers points with little spread.

The directions are combined like a structure tensor. Each direction o gives the vector PC_o (cos theta_o, sin theta_o). The largest moment M of their covariance is high when phase congruency is high in some direction, as at an edge. The smallest moment m is high only when it is high in all directions, as at a corner or a line end.

## Kernel or operator

The filters are built in the frequency domain. The radial part is Field's log-Gabor function exp(-(ln(f / f_0))^2 / (2 (ln sigmaOnf)^2)), which is 0 at f = 0. It is multiplied by Kovesi's low-pass 1 / (1 + (f / 0.45)^30). The angular part for D directions is the raised cosine (1 + cos(min(D |d theta| / 2, pi))) / 2. It reaches 0 at 2 pi / D from the filter direction. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/phase-congruency-params.md"

## Implementation

`phase_congruency_filter` in `engine/src/pixelnexus_engine/filters/phase.py` follows the steps of phasecong3 in Kovesi's ImagePhaseCongruency.jl, with NumPy and `scipy.fft`. It takes the luma with the BT.709 weights in pixel levels. The direction of a frequency is atan2(f_x, f_y), as in Kovesi's code. Kovesi's code differs from this one in four ways:

* It runs on the image as it is. This code first extends the image with the border mode, by half its size and at most 256 pixels on each side.
* It takes the median for the noise over the whole grid. This code takes it over the pixels of the image only.
* It divides by the summed amplitudes as they are. This code adds the epsilon 1e-5, so a flat image gives 0.
* It also offers the mode or a fixed value for the noise. This code uses the median.

The edges and corners are M and m, clipped to 0 to 1. With Stretch on, they are divided by their largest value, unless that is below 0.001. The feature type maps -pi / 2 to black and pi / 2 to white. Away from features it has no meaning, so it shows only where M is at least 0.05, and mid gray elsewhere. That limit is our choice.

## Worked example

--8<-- "examples/phase-congruency.md"

Without noise, every step height gives the same M. With noise, the threshold lowers faint steps much more than strong ones, since their energy is close to the noise energy. A larger k removes more noise and also more of the faint steps.

## Complexity

--8<-- "filters/phase-congruency-complexity.md"

## Artifacts and limitations

--8<-- "filters/phase-congruency-limits.md"

## Tests

The grid code must equal a transcription of Kovesi's phasecong3 for M, m and the feature type, to 1e-6, for three images and parameter sets. The filters must have their peak at f_0, 0 at f = 0, and an angular window that reaches 0 at 2 pi / D. The wavelengths and the noise threshold must follow their formulas. Multiplying the image by 3 and adding 17 must not change the result. A step must have type 0 and one peak, a bright line pi / 2 and a dark line -pi / 2. Corners of a square must show in m and not along its sides. A faint and a strong step in one image must give values within a factor of 2. A flat image must stay black even when stretched. The engine API test runs the filter.

--8<-- "filters/phase-congruency-tests.md"

## References

--8<-- "filters/phase-congruency-references.md"
