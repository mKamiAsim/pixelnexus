# Magnetic lasso

--8<-- "tools/lasso-magnetic-facts.md"

## Overview

The magnetic lasso draws an outline that clings to edges in the image. You move the pointer roughly along the edge of an object, and the outline finds the exact edge. It works well on objects with a clear outline against a different background.

## How to use it

1. Choose the magnetic lasso in the tool strip.
2. Click on the edge of the object. The first point snaps to the nearest strong edge.
3. Move the pointer along the edge. You do not need to hold the button. The outline follows the edge.
4. Click to fix a point where the outline should not move any more. **Backspace** removes the last point.
5. Close the outline on the first point, with a double-click or with **Enter**. **Escape** cancels.

## How it works

--8<-- "tools/lasso-magnetic-steps.md"

## Mathematical foundation

The tool is a **live wire**, after the intelligent scissors of Mortensen and Barrett. The image is a graph. Each pixel is a node, linked to its 8 neighbors. The outline between two points is the path with the lowest total cost.

PixelNexus uses a simpler local cost than the paper. It keeps only the gradient magnitude term:

\[
c(q) =
\begin{cases}
1 - \dfrac{G(q)}{G_{\max}} & \text{if } G(q) \ge t \, G_{\max} \\
1 & \text{otherwise}
\end{cases}
\qquad
\text{cost}(p \to q) = \big(\varepsilon + c(q)\big) \, \lVert q - p \rVert
\]

where

- \(G(q)\) is the Sobel gradient magnitude of BT.709 luma at pixel \(q\),
- \(G_{\max}\) is the largest \(G\) in the image,
- \(t\) is the contrast setting, from 0 to 1,
- \(\varepsilon = 0.1\) is a small cost for every step,
- \(\lVert q - p \rVert\) is 1 for a side neighbor and \(\sqrt{2}\) for a diagonal one.

This is an exact definition of what the code computes. Steps on strong edges cost little, so the cheapest path runs along them. Where there is no edge, every step costs about its length, so the path is a straight line. The small cost \(\varepsilon\) stops a path from wandering along an edge for nothing.

Dijkstra's algorithm finds the cheapest path. It only searches a box around the last point and the pointer. The box grows on each side by \(w + \max(24, 2w)\) pixels, where \(w\) is the width setting. When the pointer moves far, the tool sets points on the way, so each search stays small.

## Parameters

--8<-- "tools/lasso-magnetic-params.md"

## Implementation

The code is in `web/src/core/selection/livewire.ts` and the gesture in `web/src/selection/gestures.ts`. The largest gradient of the image is computed once per outline, in one pass over three rows of luma at a time. On a 36 megapixel image this takes about half a second on the first click. The closing path back to the first point may not use the pixels of the outline so far, so it cannot run back along the same edge.

## Limitations

- Where two edges are close, the outline can jump to the wrong one. Fix a point before that place.
- The cost uses brightness only. Two colors of the same brightness give no edge.
- The paper's cost has more terms than the gradient magnitude, and the paper adds on-the-fly training and boundary cooling. PixelNexus leaves these out.

## Tests

--8<-- "tools/lasso-magnetic-tests.md"

## References

--8<-- "tools/lasso-magnetic-references.md"
