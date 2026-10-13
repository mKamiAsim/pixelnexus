# Savitzky-Golay filter

--8<-- "filters/savgol-facts.md"

## Overview

The Savitzky-Golay filter fits a polynomial to the values of each window by least squares and keeps its value at the center. The fit follows peaks and ridges, so the filter smooths noise while keeping their height and width better than a box or Gaussian filter. The fit always uses the same weights for a given size and degree, so the filter is a fixed kernel.

<figure markdown="span">
  ![A plot of one row with a narrow peak, a wide peak and a small ripple. The box filter flattens the narrow peak. The Savitzky-Golay filter keeps most of its height and smooths the ripple.](../../assets/figures/savgol-light.svg#only-light){ width="480" }
  ![A plot of one row with a narrow peak, a wide peak and a small ripple. The box filter flattens the narrow peak. The Savitzky-Golay filter keeps most of its height and smooths the ripple.](../../assets/figures/savgol-dark.svg#only-dark){ width="480" }
  <figcaption>With the same size, the Savitzky-Golay filter keeps the height of the narrow peak. The box filter flattens it.</figcaption>
</figure>

## How it works

1. Fit a polynomial of the chosen degree to the values of the window.
2. Read the value of the polynomial at the center.
3. This read-off is a weighted sum with fixed weights, so run it as a kernel along rows, then columns.

## Mathematical foundation

--8<-- "filters/savgol-formula.md"

Least squares gives the polynomial coefficients as (A^T A)^-1 A^T times the window values. The value at the center is the constant coefficient, so the weights are the first row of that matrix. For 5 values and degree 2 they are (-3, 12, 17, 12, -3) / 35, from the tables of Savitzky and Golay. Degrees 0 and 1 give the plain mean, because a line through symmetric points has its mean at the center. Higher degrees keep more of the shape of peaks and remove less noise.

## Kernel or operator

The Inspector shows the kernel and its row and column factors. The negative weights at the ends are what keep peaks from flattening. The Impulse response demo in the Learn panel shows the kernel as an image.

## Algorithm

--8<-- "filters/savgol-steps.md"

## Parameters

--8<-- "filters/savgol-params.md"

## Implementation

`savgolCoefficients` in `web/src/core/filters/adaptive/savgol.ts` solves the normal equations by Gaussian elimination, once per size and degree. The filter correlates rows, then columns, with these weights. This fits a polynomial in x times a polynomial in y, as when `scipy.signal.savgol_filter` runs along both axes. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/savgol.md"

## Complexity

--8<-- "filters/savgol-complexity.md"

## Artifacts and limitations

--8<-- "filters/savgol-limits.md"

## Tests

The reference correlates with the weights of `scipy.signal.savgol_coeffs`. Before it is used, the script checks it against `scipy.signal.savgol_filter` on both axes with the mirror mode, which is reflect 101. The test covers four size and degree pairs for all five border modes.

--8<-- "filters/savgol-tests.md"

## References

--8<-- "filters/savgol-references.md"
