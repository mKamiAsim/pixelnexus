# Snap to edges

--8<-- "tools/edge-assisted-facts.md"

## Overview

**Select > Modify > Snap to edges** moves the edge of the selection onto the nearest clear edge in the image. Use it after a rough selection: a marquee a little too large, a quick lasso, or Quick Selection on a large image. This is the edge-assisted selection.

## How to use it

1. Make a selection close to the object, within a few pixels of its outline.
2. Choose **Select > Modify > Snap to edges**.
3. Set how far the edge may move (**Reach**) and press **OK**.

Where there is no clear edge within reach, the selection stays where it was.

## How it works

--8<-- "tools/edge-assisted-steps.md"

## Mathematical foundation

The **band** is the set of pixels within the reach \(r\) of the selection edge. The exact Euclidean distance transform gives each pixel its distance \(\delta\) to the other side of the edge (Felzenszwalb and Huttenlocher, 2012). A pixel is in the band when \(\delta \le r\).

The pixels next to the band keep their state and flood into it from both sides. This is a seeded watershed by flooding: a priority queue always grows the flood with the lowest-ranked pixel next. Each band pixel \(q\) gets the rank

\[
\text{rank}(q) =
\begin{cases}
\max\!\big(L_t,\ \operatorname{round}(4095\, s(q))\big) & \text{if } s(q) \ge t \\
\left\lfloor (L_t - 1)\left(1 - \operatorname{clamp}\!\left(\dfrac{\delta(q) - 1}{r}\right)\right) \right\rfloor & \text{otherwise}
\end{cases}
\]

where

- \(s(q)\) is the edge strength: the Sobel gradient of luma divided by its largest value in the image,
- \(t\) is the contrast setting, from 0 to 1,
- \(L_t = \lceil 4095\, t \rceil\) is the first rank that is an edge,
- \(\delta(q)\) is the distance of \(q\) to the old selection edge.

This is an exact definition of what the code computes. Edges strong enough rank above every other pixel, so the two floods meet on the strongest edge in the band. Other pixels rank higher the nearer they are to the old edge, so where there is no edge the floods meet on the old edge. A sharp corner can round by one pixel there, because both floods reach the corner pixel at the same rank.

After the flood, an optional majority smoothing rounds the result, and a 3x3 mean softens the edge by one pixel.

## Parameters

--8<-- "tools/edge-assisted-params.md"

## Limitations

- A large reach can jump to the edge of a different object.
- Edge strength uses brightness only. Two colors of the same brightness give no edge.
- The result is a hard selection with a one-pixel soft edge. Feather it for a softer edge.

## Tests

--8<-- "tools/edge-assisted-tests.md"

## References

--8<-- "tools/edge-assisted-references.md"
