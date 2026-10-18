# Object and Click Select

## Object selection

--8<-- "tools/object-select-classical-facts.md"

## Click Select

--8<-- "tools/click-select-classical-facts.md"

## Overview

**Select > Object** turns a rough box around an object into a selection of the object. The **Click Select** tool selects an object from clicks: click inside it, and Alt-click outside it where the selection goes too far. Both work without AI. They run the [GrabCut](../filters/segmentation/grabcut.md) and [random walker](../filters/segmentation/random-walker.md) filters in the PixelNexus engine, so the engine must be running. For AI selection, see [AI selection](ai-selection.md).

## How to use them

Select > Object:

1. Draw a rectangle around the object with the marquee. It need not be tight.
2. Choose **Select > Object**. The object replaces the selection.

Click Select:

1. Choose the Click Select tool in the tool strip.
2. Click inside the object. A green dot marks the seed, and the selection appears.
3. If the selection spills over, Alt-click on the part that should not be selected. A red ring marks a background seed.
4. Keep adding seeds until the selection fits. **Clear seeds** in the options bar starts over.

Each result is one history step, so Undo goes back one click.

## How it works

Select > Object:

--8<-- "tools/object-select-classical-steps.md"

Click Select:

--8<-- "tools/click-select-classical-steps.md"

## Mathematical foundation

GrabCut learns two mixtures of colors, one for the object and one for the background, and cuts the image where the colors and edges say. The random walker asks, for each pixel, which seed a random walk from it would most likely reach first. Edges are hard to cross, so the walk tends to stay on its side. The filter pages give the formulas.

## Parameters

Select > Object uses the defaults of the GrabCut filter and has no settings of its own.

--8<-- "tools/click-select-classical-params.md"

## Implementation

`selectObject` and `addSeed` in `web/src/app/seedActions.ts` run the filters through the same engine client as the Filters panel. Select > Object sends the selection, and GrabCut takes the rectangle around it. Click Select builds a seed map with `seedMap` in `web/src/core/selection/seeds.ts`. Object seeds are 255, background seeds 0 and everything else 128, which the random walker reads with its map rule. Until the first Alt-click, the pixels on the image edge are background seeds. The seeds belong to one image, and start over when the image changes. When you click again before a result arrives, only the newest result is kept.

## Limitations

- Both need the local engine. Without it, they say so and the selection stays as it was.
- GrabCut leans on color. On gray images with strong noise it can find nothing.
- The random walker leaks across soft edges at the default edge strength. Raise the edge strength, or add seeds near the edge.

## Tests

The seed map must mark the image edge as background until there is a background seed, paint disks of the seed size, and let later seeds paint over earlier ones. In the browser tests, Select > Object and Click Select must send their maps to a stand-in engine and turn its regions into the selection. The filters themselves are tested in `engine/tests/test_interactive.py`.

## References

--8<-- "tools/object-select-classical-references.md"

--8<-- "tools/click-select-classical-references.md"
