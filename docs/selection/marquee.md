# Rectangular and elliptical marquee

## Rectangular marquee

--8<-- "tools/marquee-rect-facts.md"

## Elliptical marquee

--8<-- "tools/marquee-ellipse-facts.md"

## Overview

The marquee tools select a rectangle or an ellipse that you drag. Press **M** for the rectangle and **Shift+M** for the ellipse.

## How to use them

1. Press where one corner should be and drag to the opposite corner.
2. Hold **Shift** while you drag for a square or circle. Hold **Alt** to draw from the center.
3. To add to the selection, hold **Shift** when you start the drag. **Alt** at the start subtracts, both intersect.
4. A click without a drag removes the selection.

The options bar sets the style. **Fixed ratio** keeps the width and height in a ratio. **Fixed size** places a box of an exact size where you click.

## How it works

The rectangle:

--8<-- "tools/marquee-rect-steps.md"

The ellipse:

--8<-- "tools/marquee-ellipse-steps.md"

## Mathematical foundation

The corners snap to whole pixel edges, so the rectangle covers whole pixels. Its mask is 255 inside and 0 outside.

The ellipse with center \((c_x, c_y)\) and half-axes \(a\) and \(b\) is the set of points with

\[
\frac{(x - c_x)^2}{a^2} + \frac{(y - c_y)^2}{b^2} \le 1
\]

where \(x\) and \(y\) are positions in pixels. This is a mathematical definition. With anti-aliasing, each pixel gets the part of its area inside the ellipse. PixelNexus measures that part on 4 rows of samples per pixel, with the exact horizontal coverage on each row. So the value of an edge pixel is right to within 1/4 of a pixel row.

## Parameters

Rectangular marquee:

--8<-- "tools/marquee-rect-params.md"

Elliptical marquee:

--8<-- "tools/marquee-ellipse-params.md"

## Limitations

- The rectangle always has whole-pixel edges. Feather it to soften them.
- Fixed size uses image pixels, so the box looks smaller on screen when you zoom out.

## Tests

--8<-- "tools/marquee-rect-tests.md"
