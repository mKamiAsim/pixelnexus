# Detail enhancement

--8<-- "filters/detail-enhance-facts.md"

## Overview

Detail enhancement smooths the image with a filter that keeps edges, the base layer, and treats what the smoothing removed as detail. Adding the detail back several times makes texture and fine structure stronger. He, Sun and Tang show it with the guided filter and with the bilateral filter.

<figure markdown="span">
  ![Three panels: a dark and a bright half with a fine texture, the result with the guided base, with much stronger texture and a dark band and a bright band along the edge, and the result with the bilateral base, with much stronger texture and a clean edge.](../../assets/figures/detail-enhance-light.svg#only-light){ width="560" }
  ![Three panels: a dark and a bright half with a fine texture, the result with the guided base, with much stronger texture and a dark band and a bright band along the edge, and the result with the bilateral base, with much stronger texture and a clean edge.](../../assets/figures/detail-enhance-dark.svg#only-dark){ width="560" }
  <figcaption>A step with fine texture, and the detail boosted 5 times over a guided and a bilateral base.</figcaption>
</figure>

## How it works

1. Smooth the image with the guided or the bilateral filter. This is the base.
2. Subtract the base from the image. This is the detail.
3. Multiply the detail by the boost and add it to the base.

## Mathematical foundation

--8<-- "filters/detail-enhance-formula.md"

The result depends on what the base filter keeps. Whatever stays in the base is not boosted. The guided filter fits a straight line in each window. With eps = 0.01, a window that crosses a strong step still flattens part of it, so that part lands in the detail layer and is boosted. The bilateral filter averages only similar values, so a step much larger than sigma_r stays whole in the base. He, Sun and Tang point out the other side: near soft edges, the bilateral filter can reverse gradients, which the guided filter never does.

## Kernel or operator

The Inspector shows the base filter with its settings, the detail layer and the boost.

## Algorithm

--8<-- "filters/detail-enhance-steps.md"

## Parameters

--8<-- "filters/detail-enhance-params.md"

## Implementation

`detailEnhanceFilter` in `web/src/core/filters/enhancement/detail.ts` gets the base from `detailBase`. The guided base is `guidedPlane`, the code of the guided filter. The bilateral base is `piecewiseBilateral`, the code of bilateral tone mapping.

## Worked example

--8<-- "examples/detail-enhance.md"

Both bases make the texture about 5 times stronger. Next to the edge, the guided base pushes the dark side from 60 down to about 13. It pushes the bright side from 180 up to about 229. These are the bands in the figure. The bilateral base leaves the edge as it was.

## Complexity

--8<-- "filters/detail-enhance-complexity.md"

## Artifacts and limitations

--8<-- "filters/detail-enhance-limits.md"

## Tests

The fixture cases come from a NumPy reference. Its base is the guided filter of the guided filter's fixtures, checked there against OpenCV, or the piecewise bilateral filter of the tone mapping fixtures. Unit tests check that a boost of 1 gives the input back, a boost of 0 gives the base, and a flat image stays flat.

--8<-- "filters/detail-enhance-tests.md"

## References

--8<-- "filters/detail-enhance-references.md"
