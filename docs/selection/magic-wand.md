# Magic Wand

--8<-- "tools/magic-wand-facts.md"

## Overview

The Magic Wand (**W**) selects the area of similar color around the pixel you click. It is quick for flat areas such as a sky, a wall or a plain background.

## How to use it

1. Choose the Magic Wand and click a color.
2. Raise the tolerance to select more colors, lower it to select fewer.
3. Turn **Contiguous** off to select every similar pixel in the image, also where it is not connected.
4. **Shift**-click adds, **Alt**-click subtracts, both intersect.

## How it works

--8<-- "tools/magic-wand-steps.md"

## Mathematical foundation

The wand compares colors as points in a color space, scaled so that black to white is 255 in each:

- **RGB**: the plain Euclidean distance of the stored values.
- **Lab**: the CIE 1976 color difference \(\Delta E^*_{ab}\) times 2.55. Lab follows how people see color differences better than RGB.
- **HSV**: the Euclidean distance in the HSV cone, with the point \((255\, s v \cos h,\ 255\, s v \sin h,\ 255\, v)\) for hue \(h\), saturation \(s\) and value \(v\).

A pixel \(p\) is selected when

\[
\lVert C(p) - C_0 \rVert \le T
\]

where \(C(p)\) is the color of \(p\) in the chosen space, \(C_0\) the sampled color, and \(T\) the tolerance. This is an exact computation. With **Contiguous** on, a flood fill from the click keeps only the selected pixels connected to it through their four side neighbors.

With anti-aliasing, each pixel then takes the mean of its 3x3 neighborhood. Pixels inside or outside a large area keep their value. Pixels on the edge become partly selected.

## Parameters

--8<-- "tools/magic-wand-params.md"

## Limitations

- The decision is hard: a pixel is in or out. Anti-alias and feather soften only the edge. For a soft selection by color, use [Color Range](color-range.md).
- Noise makes the edge ragged and leaves holes. Use a larger sample, or [Quick Selection](quick-selection.md).

## Tests

--8<-- "tools/magic-wand-tests.md"
