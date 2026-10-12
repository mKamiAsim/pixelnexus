# Selection brush and eraser

## Selection brush

--8<-- "tools/brush-select-facts.md"

## Selection eraser

--8<-- "tools/eraser-select-facts.md"

## Overview

The selection brush (**B**) paints the selection. The selection eraser (**E**) removes it. They are the most direct way to fix a selection that another tool made. A circle at the pointer shows the brush size.

## How to use them

1. Choose the brush or the eraser.
2. Paint over the image. The selection updates while you paint.
3. With the brush, hold **Alt** to remove instead of add.
4. Turn on Quick Mask (**Q**) to see the result as a red tint over the unselected part.

## How it works

Selection brush:

--8<-- "tools/brush-select-steps.md"

Selection eraser:

--8<-- "tools/eraser-select-steps.md"

## Mathematical foundation

The brush value at distance \(d\) from the stroke, for a brush of radius \(r\) and hardness \(h\) from 0 to 1, is

\[
v(d) =
\begin{cases}
\operatorname{clamp}\big(r - d + \tfrac{1}{2},\ 0,\ 1\big) & \text{if } h = 1 \\
s^2 (3 - 2s), \quad s = \operatorname{clamp}\!\left(\dfrac{r - d}{e},\ 0,\ 1\right), \quad e = \max\!\big(\tfrac{1}{2},\ r (1 - h)\big) & \text{if } h < 1
\end{cases}
\]

where \(d\) is the distance in pixels from the pixel center to the nearest point of the stroke, and \(e\) is the width of the soft edge. This is an exact definition of what the code computes. A hard brush has one pixel of anti-aliasing. A softer brush fades from full to none over the outer part of its radius, with a smooth S-shaped curve.

The stroke keeps the larger value where stamps overlap. Then, with \(m\) the selection and \(v\) the stroke:

- the brush gives \(\max(m, v)\),
- the eraser, or the brush with Alt, gives \(\min(m, 255 - v)\).

## Parameters

--8<-- "tools/brush-select-params.md"

The eraser has the same settings.

## Implementation

While you paint, only the changed rectangle of the mask goes to the graphics card again. The stroke becomes one history step when you let go.

## Limitations

- A soft brush selects pixels only partly, so filters blend in near the edge.
- The brush size is in image pixels, so it looks smaller when you zoom out.

## Tests

--8<-- "tools/brush-select-tests.md"
