# Freehand and polygonal lasso

## Freehand lasso

--8<-- "tools/lasso-facts.md"

## Polygonal lasso

--8<-- "tools/lasso-polygon-facts.md"

## Overview

The lasso tools select the area inside an outline that you draw. The freehand lasso (**L**) follows the pointer. The polygonal lasso (**Shift+L**) draws straight sides between the corners you click.

## How to use them

Freehand lasso:

1. Drag around the area.
2. Let go. A straight line closes the outline back to the start.

Polygonal lasso:

1. Click to place each corner. A line follows the pointer to the next corner.
2. **Backspace** removes the last corner. **Escape** cancels.
3. Close the shape on the first corner, with a double-click or with **Enter**.

For both, **Shift** at the start adds to the selection, **Alt** subtracts and both intersect.

## How it works

Freehand lasso:

--8<-- "tools/lasso-steps.md"

Polygonal lasso:

--8<-- "tools/lasso-polygon-steps.md"

## Mathematical foundation

The outline is a polygon. A point is inside when the **winding number** of the outline around it is not 0. The winding number counts how many times the outline turns around the point, with the direction as the sign. This is the nonzero rule. So both loops of a figure eight are inside, and a loop drawn twice does not cancel itself.

The fill works row by row. On each of 4 sample rows per pixel, the crossings of the outline give the spans inside. Each pixel gets the part of the spans that covers it, averaged over its 4 rows. Without anti-aliasing, a pixel is inside when its center is.

## Parameters

--8<-- "tools/lasso-params.md"

The polygonal lasso has the same settings.

## Limitations

- The closing line of the freehand lasso is straight.
- The polygonal lasso closes on clicks within 6 screen pixels of the first corner.

## Tests

--8<-- "tools/lasso-tests.md"
