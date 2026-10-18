# Chromatic adaptation

--8<-- "filters/chromatic-adaptation-facts.md"

## Overview

Chromatic adaptation converts colors seen under one light to how they would look under another. The eye does this on its own, which is why white paper looks white under both tungsten light and daylight. This filter models it with a von Kries type transform, such as Bradford, between two CIE illuminants.

<figure markdown="span">
  ![Three panels: a color chart, the chart adapted from D65 to illuminant A with an orange cast, and the cast chart adapted back from A to D65, close to the original.](../../assets/figures/chromatic-adaptation-light.svg#only-light){ width="480" }
  ![Three panels: a color chart, the chart adapted from D65 to illuminant A with an orange cast, and the cast chart adapted back from A to D65, close to the original.](../../assets/figures/chromatic-adaptation-dark.svg#only-dark){ width="480" }
  <figcaption>The chart, adapted from D65 to illuminant A with Bradford, and adapted back from A to D65.</figcaption>
</figure>

## How it works

1. Convert each color from linear sRGB to XYZ.
2. Convert XYZ to cone-like responses with the matrix of the method.
3. Scale each response by the ratio of the target white to the source white.
4. Convert back to XYZ and to linear sRGB.

## Mathematical foundation

--8<-- "filters/chromatic-adaptation-formula.md"

Von Kries proposed that the eye adapts by scaling the response of each cone type on its own. The transforms differ in the space where this scaling happens. The Bradford matrix sharpens the responses and is the usual choice. XYZ scaling skips the cone space and is the least accurate. All steps are linear, so the whole chain is one 3 by 3 matrix.

## Kernel or operator

The Inspector shows the 3 by 3 matrix in linear sRGB for the current lights and method.

## Algorithm

--8<-- "filters/chromatic-adaptation-steps.md"

## Parameters

--8<-- "filters/chromatic-adaptation-params.md"

## Implementation

`chromaticAdaptationFilter` in `web/src/core/filters/enhancement/white-balance.ts` builds its matrix with `rgbAdaptation` from `web/src/core/color/adaptation.ts`, which holds the white points and the cone matrices.

## Worked example

--8<-- "examples/chromatic-adaptation.md"

## Complexity

--8<-- "filters/chromatic-adaptation-complexity.md"

## Artifacts and limitations

--8<-- "filters/chromatic-adaptation-limits.md"

## Tests

The reference computes the same steps with NumPy on a small RGB test image with saturated, gray, black and white pixels, and compares all three channels. Before the cases are written, the XYZ matrices from A to D65 for all three methods must match Lindbloom's precomputed table to 1e-6. More tests check that the source white maps onto the target white, and that equal lights change nothing.

--8<-- "filters/chromatic-adaptation-tests.md"

## References

--8<-- "filters/chromatic-adaptation-references.md"
